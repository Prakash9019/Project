Since we've already gone through the entire EAS setup for your NearMe app, here's the **complete command sequence** I recommend keeping. This is the order you'll typically use from a fresh project through sharing APKs and publishing.

---

# 1. Install EAS CLI (One-time)

```bash
npm install -g eas-cli
```

Verify:

```bash
eas --version
```

([Expo Documentation][1])

---

# 2. Login

```bash
eas login
```

Check who is logged in:

```bash
eas whoami
```

Logout:

```bash
eas logout
```

([Expo Documentation][1])

---

# 3. Link the Expo Project (One-time)

If you already have a project ID:

```bash
eas init --id YOUR_PROJECT_ID
```

Or create a new project:

```bash
eas init
```

---

# 4. Configure EAS Build (One-time)

```bash
eas build:configure
```

This generates:

```text
eas.json
```

([Expo Documentation][2])

---

# 5. Verify the Project

```bash
npx expo-doctor
```

Check configuration:

```bash
npx expo config --type public
```

---

# 6. Environment Variables

List variables:

```bash
eas env:list
```

List variables for a specific environment:

```bash
eas env:list --environment preview
```

Create a variable:

```bash
eas env:create
```

Pull variables locally:

```bash
eas env:pull
```

([Expo Documentation][3])

---

# 7. Build APK (Internal Testing)

This is what you used for NearMe.

```bash
eas build --platform android --profile preview
```

If `preview` has:

```json
"android": {
  "buildType": "apk"
}
```

you'll get an **APK**.

---

# 8. Development Build

```bash
eas build --platform android --profile development
```

Creates a Development Client APK.

---

# 9. Production Build (Play Store)

```bash
eas build --platform android --profile production
```

Usually generates an **AAB**.

([Expo Documentation][1])

---

# 10. Build With Clean Cache

Useful after changing:

* app.json
* plugins
* native config

```bash
eas build --platform android --profile preview --clear-cache
```

---

# 11. Local Build

Instead of cloud:

```bash
eas build --local
```

([Expo Documentation][4])

---

# 12. View Build History

```bash
eas build:list
```

View a specific build:

```bash
eas build:view BUILD_ID
```

([Expo Documentation][1])

---

# 13. Cancel a Running Build

```bash
eas build:cancel BUILD_ID
```

---

# 14. Submit to Google Play

```bash
eas submit --platform android
```

Using a profile:

```bash
eas submit --platform android --profile production
```

([Expo Documentation][5])

---

# 15. OTA (Over-the-Air) Updates

Configure once:

```bash
eas update:configure
```

Publish an update:

```bash
eas update --channel preview --message "Bug fixes"
```

Production:

```bash
eas update --channel production --message "Version 1.0.1"
```

([Expo Documentation][6])

---

# 16. Credentials

Manage Android/iOS credentials:

```bash
eas credentials
```

Configure credentials:

```bash
eas credentials:configure-build
```

([GitHub][7])

---

# 17. Project Information

```bash
eas project:info
```

---

# 18. Check CLI Version

```bash
eas --version
```

Update CLI:

```bash
npm install -g eas-cli
```

---

# 🚀 NearMe workflow (the one you'll use most often)

```bash
# 1
git pull

# 2
npm install

# 3
npx expo-doctor

# 4
eas env:list

# 5
eas build --platform android --profile preview --clear-cache

# 6
Download APK

# 7
Share APK with testers
```

---

# 📱 Production Release Workflow

```bash
git pull

npm install

npx expo-doctor

eas env:list --environment production

eas build --platform android --profile production

eas submit --platform android
```


If you changed the backend URL in the Expo EAS Environment Variables (for example EXPO_PUBLIC_API_URL):

You do not need a full native rebuild, but you do need to publish an OTA update for the new value to be bundled into your app. EAS environment variables are applied when you publish an update using the correct environment.

For example:

eas update --environment production --channel production


you can run:

# Android APK
eas build --platform android --profile preview

# iPhone IPA
eas build --platform ios --profile preview

Or build both platforms together:

eas build --platform all --profile preview

✅ Android: You can send the .apk directly to anyone, and they can install it (if they allow installation from unknown sources).
⚠️ iPhone: You can generate an .ipa, but you cannot simply send the .ipa to your friend and have them install it. Apple requires the app to be code-signed and installed through an approved mechanism such as Ad Hoc distribution (registered devices), Enterprise distribution, or TestFlight. A paid Apple Developer account is required for Ad Hoc or App Store/TestFlight distribution.

---

## ⭐ Commands you'll use almost every day

```bash
eas login

eas whoami

eas build --platform android --profile preview

eas build --platform android --profile production

eas build:list

eas env:list

npx expo-doctor

npx expo config --type public
```

This set covers nearly all day-to-day EAS tasks for development, testing, and production deployment.

[1]: https://docs.expo.dev/build/setup/?utm_source=chatgpt.com "Create your first build"
[2]: https://docs.expo.dev/build-reference/build-configuration/?utm_source=chatgpt.com "Build configuration process"
[3]: https://docs.expo.dev/eas/environment-variables/manage/?utm_source=chatgpt.com "Create and manage environment variables in EAS"
[4]: https://docs.expo.dev/build-reference/local-builds/?utm_source=chatgpt.com "Run EAS Build locally with local flag"
[5]: https://docs.expo.dev/build/introduction/?utm_source=chatgpt.com "EAS Build - Expo Documentation"
[6]: https://docs.expo.dev/eas-update/getting-started/?utm_source=chatgpt.com "Get started with EAS Update"
[7]: https://github.com/expo/eas-cli?utm_source=chatgpt.com "expo/eas-cli: Fastest way to build, submit, and update iOS ..."
