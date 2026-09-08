import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { WebView } from 'react-native-webview';

const APP_URL = 'https://diario-de-aula-web.onrender.com/';

export default function App() {
  const webView = useRef(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack) return false;
      webView.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  if (failed) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.offline}>
          <View style={styles.mark}><Text style={styles.markText}>e.</Text></View>
          <Text style={styles.title}>Não foi possível conectar.</Text>
          <Text style={styles.copy}>Confira sua internet e tente abrir seu espaço novamente.</Text>
          <TouchableOpacity style={styles.button} onPress={() => { setFailed(false); setLoading(true); }}>
            <Text style={styles.buttonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#f6f5f2" />
      <WebView
        ref={webView}
        source={{ uri: APP_URL }}
        originWhitelist={['https://*']}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction
        setSupportMultipleWindows={false}
        onNavigationStateChange={state => setCanGoBack(state.canGoBack)}
        onLoadEnd={() => setLoading(false)}
        onError={() => setFailed(true)}
        onHttpError={event => {
          if (event.nativeEvent.statusCode >= 500) setFailed(true);
        }}
        style={styles.web}
      />
      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator color="#7278ef" size="large" />
          <Text style={styles.loadingText}>Abrindo seu espaço…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f5f2' },
  web: { flex: 1, backgroundColor: '#f6f5f2' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f6f5f2'
  },
  loadingText: { color: '#737487', fontSize: 12, fontWeight: '600' },
  offline: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 34 },
  mark: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
    borderRadius: 17,
    backgroundColor: '#171a3a'
  },
  markText: { color: '#fff', fontSize: 25, fontWeight: '800' },
  title: { color: '#171a3a', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  copy: { maxWidth: 300, marginTop: 9, color: '#7d7e90', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  button: { marginTop: 24, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 11, backgroundColor: '#171a3a' },
  buttonText: { color: '#fff', fontSize: 12, fontWeight: '700' }
});
