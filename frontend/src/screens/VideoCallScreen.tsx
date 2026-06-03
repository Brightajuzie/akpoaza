// @ts-nocheck
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

export default function VideoCallScreen({ route }: any) {
  const { roomName } = route.params;

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: `https://meet.jit.si/${roomName}` }}
        style={{ flex: 1 }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }
});
