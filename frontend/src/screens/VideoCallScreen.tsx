// @ts-nocheck
import React, { useEffect } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator } from 'react-native';

let WebView: any = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn('WebView could not be loaded on this platform.', e);
  }
}

const DESKTOP_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.163 Safari/537.36';

export default function VideoCallScreen({ route }: any) {
  const { roomName } = route.params;

  useEffect(() => {
    const requestAndroidPermissions = async () => {
      if (Platform.OS === 'android') {
        try {
          const { PermissionsAndroid } = require('react-native');
          await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.CAMERA,
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          ]);
        } catch (err) {
          console.warn('Error requesting camera/audio permissions:', err);
        }
      }
    };
    requestAndroidPermissions();
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <iframe
          src={`https://meet.jit.si/${roomName}`}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="camera; microphone; display-capture; fullscreen"
          title="Jitsi Video Call"
        />
      </View>
    );
  }

  if (!WebView) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: `https://meet.jit.si/${roomName}` }}
        style={{ flex: 1 }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        userAgent={DESKTOP_USER_AGENT}
        onPermissionRequest={(event) => {
          event.grant(event.resources);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }
});
