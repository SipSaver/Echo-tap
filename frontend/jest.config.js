module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|expo(nent)?|@expo(nent)?/.*|@expo/.*|expo(nent)?|@unimodules|unimodules|sentry-expo|native-base|@sentry/.*)'
  ]
};
