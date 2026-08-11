import AsyncStorage from '@react-native-async-storage/async-storage';
const KEY = 'verde-bowl.expo-push-token.v1';
export const pushStorage = { read: () => AsyncStorage.getItem(KEY), write: (token: string) => AsyncStorage.setItem(KEY, token), clear: () => AsyncStorage.removeItem(KEY) };
