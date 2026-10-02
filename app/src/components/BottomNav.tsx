import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type TabName = 'home' | 'map' | 'sos' | 'news' | 'profile';

interface TabItem {
  name: TabName;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}

const TABS: TabItem[] = [
  {
    name: 'home',
    label: 'Trang chủ',
    icon: 'home-outline',
    iconActive: 'home',
  },
  {
    name: 'map',
    label: 'Bản đồ',
    icon: 'map-outline',
    iconActive: 'map',
  },
  {
    name: 'sos',
    label: 'SOS',
    icon: 'notifications-outline',
    iconActive: 'notifications',
  },
  {
    name: 'news',
    label: 'Tin tức',
    icon: 'newspaper-outline',
    iconActive: 'newspaper',
  },
  {
    name: 'profile',
    label: 'Cá nhân',
    icon: 'person-outline',
    iconActive: 'person',
  },
];

interface BottomNavProps {
  activeTab: TabName;
  onTabPress: (tab: TabName) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabPress }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {/* Top border line */}
      <View style={styles.topBorder} />

      <View style={styles.tabRow}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.name;
          const isSOS = tab.name === 'sos';

          if (isSOS) {
            return (
              <View key={tab.name} style={styles.sosWrapper}>
                <TouchableOpacity
                  style={styles.sosButton}
                  onPress={() => onTabPress(tab.name)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={isActive ? tab.iconActive : tab.icon}
                    size={30}
                    color="#FFFFFF"
                  />
                  <Text style={styles.sosLabel}>SOS</Text>
                </TouchableOpacity>
              </View>
            );
          }

          return (
            <TouchableOpacity
              key={tab.name}
              style={styles.tabItem}
              onPress={() => onTabPress(tab.name)}
              activeOpacity={0.7}
            >
              {isActive && <View style={styles.activeIndicator} />}
              <Ionicons
                name={isActive ? tab.iconActive : tab.icon}
                size={24}
                color={isActive ? '#0066FF' : '#94A3B8'}
              />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  topBorder: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 4,
    position: 'relative',
  },
  activeIndicator: {
    position: 'absolute',
    top: -8,
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#0066FF',
  },
  tabLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#0066FF',
    fontWeight: '700',
  },
  // SOS nút nổi ở giữa
  sosWrapper: {
    flex: 1,
    alignItems: 'center',
    marginBottom: 10,
  },
  sosButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -28,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  sosLabel: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 1,
  },
});
