import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { joinLan, joinOnline } from '@/net/session';

// Opened from an invite link or a scanned QR code:
//   zenplay://join?code=ABCDE            online room
//   zenplay://join?lan=192.168.1.5:7351  Wi-Fi host
export default function Join() {
  const { code, lan } = useLocalSearchParams<{ code?: string; lan?: string }>();

  useEffect(() => {
    if (lan) joinLan(lan);
    else if (code) joinOnline(code);
    router.replace(code || lan ? '/room' : '/');
  }, [code, lan]);

  return null;
}
