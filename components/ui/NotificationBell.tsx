// Powered by OnSpace.AI
// Notification bell with unread count + bell sound on new events
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useStore } from '@/hooks/useStore';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '@/constants/theme';
import { AppNotification } from '@/constants/types';
import { formatDateTime } from '@/services/format';

// Play bell sound
async function playBell() {
  if (Platform.OS === 'web') {
    try {
      if (typeof window === 'undefined') return;
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    } catch {}
    return;
  }
  try {
    const Haptics = require('expo-haptics');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
}

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const NOTIF_ICONS: Record<AppNotification['type'], { icon: IconName; color: string }> = {
  join_request: { icon: 'account-clock-outline', color: Colors.warning },
  user_approved: { icon: 'account-check', color: Colors.success },
  system: { icon: 'information-outline', color: Colors.info },
  low_stock: { icon: 'alert-circle-outline', color: Colors.danger },
};

export default function NotificationBell() {
  const { notifications, unreadNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, settings } = useStore();
  const [visible, setVisible] = useState(false);
  const lastCountRef = useRef(unreadNotifications);
  const lastNotifIdRef = useRef<string | null>(notifications[0]?.id || null);

  // Ring bell on new notification
  useEffect(() => {
    if (!notifications.length) return;
    const latest = notifications[0];
    if (latest.id === lastNotifIdRef.current) return;
    lastNotifIdRef.current = latest.id;
    if (settings.soundEnabled !== false) {
      playBell();
    }
  }, [notifications, settings.soundEnabled]);

  function openPanel() {
    setVisible(true);
  }

  function closePanel() {
    setVisible(false);
  }

  function handleMarkAll() {
    markAllNotificationsRead();
  }

  function handleTap(notif: AppNotification) {
    markNotificationRead(notif.id);
  }

  const iconMeta = (type: AppNotification['type']) =>
    NOTIF_ICONS[type] || { icon: 'bell-outline' as IconName, color: Colors.primary };

  return (
    <>
      <Pressable onPress={openPanel} style={styles.bellWrap} hitSlop={8}>
        <MaterialCommunityIcons name="bell-outline" size={24} color={Colors.text} />
        {unreadNotifications > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadNotifications > 99 ? '99+' : String(unreadNotifications)}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closePanel}
      >
        <Pressable style={styles.backdrop} onPress={closePanel} />
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Pressable onPress={handleMarkAll} hitSlop={8}>
              <Text style={styles.markAllText}>قراءة الكل</Text>
            </Pressable>
            <Text style={styles.panelTitle}>الإشعارات</Text>
            <Pressable onPress={closePanel} hitSlop={8}>
              <MaterialCommunityIcons name="close" size={22} color={Colors.text} />
            </Pressable>
          </View>

          {notifications.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="bell-off-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>لا توجد إشعارات</Text>
            </View>
          ) : (
            <FlatList
              data={notifications}
              keyExtractor={(n) => n.id}
              style={styles.list}
              renderItem={({ item }) => {
                const meta = iconMeta(item.type);
                return (
                  <Pressable
                    onPress={() => handleTap(item)}
                    style={({ pressed }) => [
                      styles.notifRow,
                      !item.read && styles.notifRowUnread,
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <Pressable
                      onPress={() => deleteNotification(item.id)}
                      hitSlop={8}
                      style={styles.deleteBtn}
                    >
                      <MaterialCommunityIcons name="close" size={14} color={Colors.textMuted} />
                    </Pressable>
                    <View style={{ flex: 1, alignItems: 'flex-end', marginRight: Spacing.sm }}>
                      <Text style={[styles.notifTitle, !item.read && styles.notifTitleUnread]}>
                        {item.title}
                      </Text>
                      <Text style={styles.notifMsg} numberOfLines={2}>{item.message}</Text>
                      <Text style={styles.notifDate}>{formatDateTime(item.date)}</Text>
                    </View>
                    <View style={[styles.notifIconBox, { backgroundColor: meta.color + '20' }]}>
                      <MaterialCommunityIcons name={meta.icon} size={20} color={meta.color} />
                    </View>
                    {!item.read ? <View style={styles.unreadDot} /> : null}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: Colors.danger,
    borderRadius: Radius.full,
    minWidth: 18, height: 18,
    paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.surface,
  },
  badgeText: { color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  panel: {
    position: 'absolute', top: 60, right: 12, left: 12,
    maxHeight: 480,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    ...Shadow.md,
    overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  panelTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  markAllText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  list: { maxHeight: 400 },
  notifRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  notifRowUnread: { backgroundColor: Colors.primaryTint },
  notifIconBox: { width: 40, height: 40, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  notifTitle: { color: Colors.text, fontSize: FontSize.sm, fontWeight: FontWeight.medium, textAlign: 'right' },
  notifTitleUnread: { fontWeight: FontWeight.bold },
  notifMsg: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2, textAlign: 'right' },
  notifDate: { color: Colors.textMuted, fontSize: 10, marginTop: 4 },
  deleteBtn: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt },
  unreadDot: { width: 8, height: 8, borderRadius: Radius.full, backgroundColor: Colors.primary, position: 'absolute', top: Spacing.md, left: Spacing.md + 28 },
  emptyBox: { padding: Spacing.xxxl, alignItems: 'center', gap: Spacing.md },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.md },
});
