import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { supabase } from '../lib/supabase';

type AuthStep = 'email' | 'code';

export default function AuthScreen() {
  const [step, setStep] = useState<AuthStep>('email');

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function sendCode() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setMessage('Enter your email address.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,

        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        throw error;
      }

      setEmail(cleanEmail);
      setStep('code');

      setMessage('A sign-in code was sent to your email.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'A2 could not send the sign-in code.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    const cleanCode = code.trim();

    if (!cleanCode) {
      setMessage('Enter the code from your email.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: cleanCode,
        type: 'email',
      });

      if (error) {
        throw error;
      }

      // HomeScreen will automatically detect
      // that authentication succeeded.
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'That sign-in code could not be verified.'
      );
    } finally {
      setLoading(false);
    }
  }

  function restartEmail() {
    setCode('');
    setMessage('');
    setStep('email');
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      <KeyboardAvoidingView
        style={styles.interface}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.brand}>A2</Text>
        </View>

        <View style={styles.center}>
          <View style={styles.mark}>
            <View style={styles.markInner} />
          </View>

          {step === 'email' ? (
            <>
              <Text style={styles.title}>
                This A2 is private.
              </Text>

              <Text style={styles.subtitle}>
                Verify your identity to continue.
              </Text>

              <View style={styles.inputShell}>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor="rgba(28, 27, 24, 0.34)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="continue"
                  onSubmitEditing={sendCode}
                  style={styles.input}
                />
              </View>

              <Pressable
                onPress={sendCode}
                disabled={loading}
                style={[
                  styles.button,
                  loading && styles.buttonDisabled,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#F4F2ED" />
                ) : (
                  <Text style={styles.buttonText}>
                    Continue
                  </Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>
                Check your email.
              </Text>

              <Text style={styles.subtitle}>
                Enter the code sent to {email}
              </Text>

              <View style={styles.codeShell}>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="000000"
                  placeholderTextColor="rgba(28, 27, 24, 0.25)"
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={8}
                  returnKeyType="done"
                  onSubmitEditing={verifyCode}
                  style={styles.codeInput}
                />
              </View>

              <Pressable
                onPress={verifyCode}
                disabled={loading}
                style={[
                  styles.button,
                  loading && styles.buttonDisabled,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#F4F2ED" />
                ) : (
                  <Text style={styles.buttonText}>
                    Verify
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={restartEmail}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryText}>
                  Use a different email
                </Text>
              </Pressable>
            </>
          )}

          {!!message && (
            <Text style={styles.message}>
              {message}
            </Text>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.alpha}>
            A2 • PRIVATE ALPHA
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F3F1EC',
  },

  interface: {
    flex: 1,
  },

  header: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brand: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 5,
    color: '#22211E',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    marginTop: -30,
  },

  mark: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(38, 38, 36, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 34,
  },

  markInner: {
    width: 46,
    height: 52,
    borderRadius: 28,
    backgroundColor: 'rgba(38, 38, 36, 0.58)',
    transform: [{ rotate: '-8deg' }],
  },

  title: {
    fontSize: 24,
    fontWeight: '400',
    letterSpacing: -0.6,
    color: '#25241F',
    textAlign: 'center',
  },

  subtitle: {
    maxWidth: 400,
    marginTop: 10,
    marginBottom: 28,
    color: 'rgba(37, 36, 31, 0.48)',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },

  inputShell: {
    width: '100%',
    maxWidth: 420,
    minHeight: 58,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(35, 33, 29, 0.09)',
    backgroundColor: 'rgba(255,255,255,0.44)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  input: {
    minHeight: 56,
    color: '#22211E',
    fontSize: 16,
  },

  codeShell: {
    width: '100%',
    maxWidth: 280,
    minHeight: 68,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(35, 33, 29, 0.09)',
    backgroundColor: 'rgba(255,255,255,0.44)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  codeInput: {
    minHeight: 66,
    color: '#22211E',
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 7,
  },

  button: {
    width: '100%',
    maxWidth: 420,
    minHeight: 52,
    marginTop: 14,
    borderRadius: 20,
    backgroundColor: '#22211E',
    alignItems: 'center',
    justifyContent: 'center',
  },

  buttonDisabled: {
    opacity: 0.55,
  },

  buttonText: {
    color: '#F5F3ED',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  secondaryButton: {
    marginTop: 18,
    padding: 8,
  },

  secondaryText: {
    color: 'rgba(37, 36, 31, 0.48)',
    fontSize: 13,
  },

  message: {
    marginTop: 18,
    maxWidth: 420,
    textAlign: 'center',
    color: 'rgba(37, 36, 31, 0.58)',
    fontSize: 13,
    lineHeight: 19,
  },

  footer: {
    alignItems: 'center',
    paddingBottom: 24,
  },

  alpha: {
    color: 'rgba(40, 38, 34, 0.27)',
    fontSize: 8,
    letterSpacing: 2,
  },
});