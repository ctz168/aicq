/**
 * Hook: before_tool_call
 *
 * Permission check before tool execution.  Enforces friend count limits,
 * validates targets, and rate-limits key exports.
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

    return { allowed: true };
  }

  /**
   * Check chat-friend permissions:
   *  - "add" action: check friend count < maxFriends
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
}
