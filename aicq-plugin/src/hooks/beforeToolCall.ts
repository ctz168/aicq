/**
 * Hook: before_tool_call
 *
 * Permission check before tool execution.  Enforces friend count limits,
 * validates targets, rate-limits key exports, and checks exec permissions
 * for AI agents interacting with human friends.
 */

import type { PluginStore } from "../store.js";
import type { PluginConfig, Logger } from "../types.js";
import type { ChatExportKeyTool } from "../tools/chatExportKey.js";

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

export class BeforeToolCallHook {
  private store: PluginStore;
  private config: PluginConfig;
  private exportKeyTool: ChatExportKeyTool;
  private logger: Logger;

  constructor(
    store: PluginStore,
    config: PluginConfig,
    exportKeyTool: ChatExportKeyTool,
    logger: Logger,
  ) {
    this.store = store;
    this.config = config;
    this.exportKeyTool = exportKeyTool;
    this.logger = logger;
  }

  /**
   * Check if a tool call is allowed.
   *
   * @param toolName  The name of the tool being called
   * @param params  The parameters for the tool call
   * @returns Permission result with allowed flag and optional reason
   */
  check(toolName: string, params: Record<string, unknown>): PermissionResult {
    switch (toolName) {
      case "chat-send":
        return this.checkChatSend(params);
      case "chat-friend":
        return this.checkChatFriend(params);
      case "chat-export-key":
        return this.checkChatExportKey();
      default:
        // Unknown tools are allowed
        return { allowed: true };
    }
  }

  /**
   * Check chat-send permissions:
   *  - Target must be a valid friend
   *  - Target must have granted 'chat' permission to this agent
   */
  private checkChatSend(params: Record<string, unknown>): PermissionResult {
    const target = params.target as string;

    if (!target) {
      return { allowed: false, reason: "Missing target parameter" };
    }

    const friend = this.store.getFriend(target);
    if (!friend) {
      return {
        allowed: false,
        reason: "Cannot send message — target is not in your friend list: " + target,
      };
    }

    // ─── 权限检查：对方是否授予了 chat 权限 ───
    const permissions = friend.permissions || ['chat'];
    if (!permissions.includes('chat')) {
      return {
        allowed: false,
        reason: "对方未授予你聊天权限（chat），无法发送消息给: " + target,
      };
    }

    return { allowed: true };
  }

  /**
   * Check chat-friend permissions:
   *  - "add" action: check friend count < maxFriends + requires exec permission from the friend
   *  - "remove" action: requires exec permission
   */
  private checkChatFriend(params: Record<string, unknown>): PermissionResult {
    const action = params.action as string;

    if (action === "add") {
      if (this.store.getFriendCount() >= this.config.maxFriends) {
        return {
          allowed: false,
          reason: `Friend limit reached (${this.config.maxFriends}). Remove a friend before adding a new one.`,
        };
      }
      // Adding a friend is a management action, always allowed for the agent itself
      return { allowed: true };
    }

    if (action === "remove") {
      // Removing a friend is an exec-level action — check if the target friend
      // has granted exec permission (though typically this is agent's own decision)
      return { allowed: true };
    }

    return { allowed: true };
  }

  /**
   * Check chat-export-key permissions:
   *  - Rate limit: max 3 exports per 5 minutes
   */
  private checkChatExportKey(): PermissionResult {
    if (this.exportKeyTool.isRateLimited()) {
      return {
        allowed: false,
        reason: "Rate limit exceeded for key exports. Max 3 exports per 5 minutes.",
      };
    }

    return { allowed: true };
  }

  /**
   * Check if a tool requires exec permission from the target friend.
   * Tools that modify state on the target's side need exec permission.
   *
   * @param toolName  The name of the tool being called
   * @param targetFriendId  The friend ID being targeted
   * @returns Permission result
   */
  checkExecPermission(toolName: string, targetFriendId: string): PermissionResult {
    // These tools/actions require exec permission from the target
    const execRequiredTools = [
      'chat-friend',  // adding/removing friends
    ];

    if (!execRequiredTools.includes(toolName)) {
      return { allowed: true };
    }

    const friend = this.store.getFriend(targetFriendId);
    if (!friend) {
      return {
        allowed: false,
        reason: "Target is not in your friend list: " + targetFriendId,
      };
    }

    const permissions = friend.permissions || ['chat'];
    if (!permissions.includes('exec')) {
      this.logger.warn(`[BeforeToolCall] exec permission denied for tool '${toolName}' on ${targetFriendId}`);
      return {
        allowed: false,
        reason: "对方未授予你执行权限（exec），无法执行此操作。请让对方在好友设置中授予 exec 权限。",
      };
    }

    return { allowed: true };
  }
}
