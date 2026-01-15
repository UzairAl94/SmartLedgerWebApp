import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.uzairalam.smartledger',
  appName: 'Smart Ledger',
  webDir: 'dist',
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      iosKeychainPrefix: 'smartledger',
      iosBiometric: {
        biometricAuth: false,
        biometricTitle: 'Biometric login'
      },
      androidIsEncryption: false,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: 'Biometric login',
        biometricSubTitle: 'Log in using biometric authentication'
      }
    }
  }
};

export default config;
