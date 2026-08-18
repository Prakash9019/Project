// EAS sets EAS_BUILD_PROFILE during a cloud build. Local `expo start` /
// `expo run:*` leave it unset, which is treated as a development build.
const BUILD_PROFILE = process.env.EAS_BUILD_PROFILE ?? "development";
// preview + production are the profiles that go onto real testers' devices and
// talk to the HTTPS API — neither may permit arbitrary cleartext HTTP.
const IS_RELEASE_BUILD = BUILD_PROFILE === "preview" || BUILD_PROFILE === "production";

export default {
  expo: {
    name: "NearMe",
    slug: "nearme",
    version: "1.0.2",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: "nearme",
    userInterfaceStyle: "dark",
    backgroundColor: "#000000",

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.nearme.app",
      googleServicesFile: "./GoogleService-Info.plist",
      infoPlist: {
        NSCameraUsageDescription: "NearMe uses your camera for video calls and verification.",
        NSMicrophoneUsageDescription: "NearMe uses your microphone for audio and video calls.",
        NSPhotoLibraryUsageDescription: "NearMe lets you add photos to your profile and albums.",
        NSPhotoLibraryAddUsageDescription: "NearMe saves photos and videos you download from chats and albums to your photo library.",
        NSLocationWhenInUseUsageDescription: "NearMe shows people near you based on your location.",
      },
    },

    android: {
      adaptiveIcon: {
        backgroundColor: "#000000",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },

      predictiveBackGestureEnabled: false,
      package: "com.nearme.app",
      softwareKeyboardLayoutMode: "resize",
      googleServicesFile: "./google-services.json",

      permissions: [
        "CAMERA",
        "RECORD_AUDIO",
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "READ_MEDIA_IMAGES",
        // Chat/album video playback + "Save to gallery" on video messages.
        "READ_MEDIA_VIDEO",
        // Android 13+ requires this before FCM notifications can be displayed.
        "POST_NOTIFICATIONS",
      ],

      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY,
        },
      },
    },

    web: {
      favicon: "./assets/favicon.png",
      bundler: "metro",
    },

    plugins: [
      "expo-router",
      "expo-image",
      [
        "expo-location",
        {
          locationWhenInUsePermission: "NearMe shows people near you based on your location.",
        },
      ],
      "@react-native-firebase/app",
      "@react-native-firebase/auth",
      "@react-native-firebase/messaging",
      [
        "@react-native-google-signin/google-signin",
        {
          iosUrlScheme: "com.googleusercontent.apps.1078544839352-3u84umnjqu36lcld7ki7g4dembeum15t",
        },
      ],
      "expo-font",
      [
        // MediaViewer / chat "Save to gallery" call MediaLibrary.saveToLibraryAsync.
        // The plugin injects the correct Android storage permissions (with the
        // maxSdkVersion attributes Play expects) and the iOS add-only usage string.
        "expo-media-library",
        {
          photosPermission: "NearMe lets you save photos and videos from chats and albums.",
          savePhotosPermission: "NearMe saves photos and videos you download to your photo library.",
          isAccessMediaLocationEnabled: false,
        },
      ],
      [
        "expo-build-properties",
        {
          android: {
            // Dev/local builds hit http://<lan-ip>:4000; release builds must not
            // permit cleartext HTTP at all (see IS_RELEASE_BUILD at the top).
            usesCleartextTraffic: !IS_RELEASE_BUILD,
          },
          ios: {
            useFrameworks: "static",
          },
        },
      ],
      "expo-splash-screen",
      "expo-audio",
      "expo-asset",
      // react-native-maps ships no config plugin; the Android Google Maps key is
      // injected via android.config.googleMaps.apiKey above (com.google.android.geo.API_KEY).
    ],

    experiments: {
      typedRoutes: true,
    },

    extra: {
      router: {},
      eas: {
        projectId: "97057865-f232-4e91-9b60-046bca52f602",
      },
    },

    owner: "pentakotacharan",

    runtimeVersion: {
      policy: "appVersion",
    },

    updates: {
      url: "https://u.expo.dev/97057865-f232-4e91-9b60-046bca52f602",
    },
  },
};