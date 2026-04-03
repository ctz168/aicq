import React, { useCallback } from 'react';
import { useAICQ } from './context/AICQContext';
import type { ScreenName, TabName } from './types';
import Sidebar from './components/Sidebar';
import LoginScreen from './screens/LoginScreen';
import ChatListScreen from './screens/ChatListScreen';
import ChatScreen from './screens/ChatScreen';
import FriendsScreen from './screens/FriendsScreen';
import TempNumberScreen from './screens/TempNumberScreen';
import SettingsScreen from './screens/SettingsScreen';

const App: React.FC = () => {
  const { state, navigate } = useAICQ();

  const handleTabChange = useCallback((tab: TabName) => {
    navigate(tab as ScreenName, null);
  }, [navigate]);

  // Not connected - show login
  if (!state.isInitialized || state.screen === 'login') {
    return <LoginScreen />;
  }

  // Chat screen (full screen, no sidebar)
  if (state.screen === 'chat') {
    return <ChatScreen />;
  }

  // Determine active tab for sidebar
  const activeTab: TabName =
    state.screen === 'friends'
      ? 'friends'
      : state.screen === 'tempNumber'
        ? 'tempNumber'
        : state.screen === 'settings'
          ? 'settings'
          : state.screen === 'chatList'
            ? 'chatList'
            : 'chatList';

  // Render active screen
  const renderScreen = () => {
    switch (state.screen) {
      case 'friends':
        return <FriendsScreen />;
      case 'tempNumber':
        return <TempNumberScreen />;
      case 'settings':
        return <SettingsScreen />;
      case 'chatList':
      default:
        return <ChatListScreen />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        unreadCounts={state.unreadCounts}
        hasActiveChat={false}
      />
      <main className="main-content">
        {renderScreen()}
      </main>
    </div>
  );
};

export default App;
