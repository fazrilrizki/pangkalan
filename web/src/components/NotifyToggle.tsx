import { useState } from 'react';
import { useWaitingNotifications } from '../hooks/use-waiting-notifications';
import { notificationsSupported, readEnabled, writeEnabled } from '../lib/notify';
import { Icon } from './Icon';

/** Bell button: asks for permission on first use (never on page load) and toggles alerts. */
export function NotifyToggle() {
  const supported = notificationsSupported();
  const [permission, setPermission] = useState(supported ? Notification.permission : 'denied');
  const [enabled, setEnabled] = useState(readEnabled);
  const active = supported && permission === 'granted' && enabled;

  useWaitingNotifications(active);

  async function toggle() {
    if (!supported) return;
    if (permission === 'default') {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        setEnabled(true);
        writeEnabled(true);
      }
      return;
    }
    setEnabled(!enabled);
    writeEnabled(!enabled);
  }

  const label = !supported
    ? 'Browser tidak mendukung notifikasi'
    : permission === 'denied'
      ? 'Notifikasi diblokir di pengaturan browser'
      : active
        ? 'Matikan notifikasi saat sesi menunggu input'
        : 'Nyalakan notifikasi saat sesi menunggu input';

  return (
    <button
      className={`icon-btn ${active ? 'text-fg' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={!supported || permission === 'denied'}
      onClick={() => void toggle()}
    >
      <Icon name={active ? 'bell' : 'bellOff'} />
    </button>
  );
}
