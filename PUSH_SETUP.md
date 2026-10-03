# Push broadcast — one-time setup

Two things only you can do (they need your Firebase Console login), both
one-time:

## 1. Firestore security rules

Devices write their own push token to Firestore with no login (that's by
design — push should work for anyone using the app, not just signed-in
users). Firestore's default rules block all access, so you need to allow
*writing* to `pushTokens` while keeping it *unreadable* to the public (so
no one else can scrape every registered device's token):

Firebase Console → your project (`scholarix-d9c7c`) → Firestore Database →
Rules, add:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /pushTokens/{token} {
      allow create: if true;
      allow read, update, delete: if false;
    }
  }
}
```

If you already have other rules for other collections in there, just add
the `pushTokens` block alongside them — don't replace the whole file.

If Firestore itself has never been enabled for this project (it's a
different product from Realtime Database), you'll see a prompt to create
a database the first time you open that Rules tab — just use the default
("Production mode," any region) and then add the rule above.

## 2. Service account key (lets the broadcast script send messages)

Firebase Console → Project settings (gear icon) → Service accounts →
"Generate new private key." This downloads a JSON file.

Rename it to `serviceAccountKey.json` and place it at the project root
(next to `package.json`). **Never commit this file** — it's already
covered by `.gitignore`'s `*.json` exclusion... actually it isn't, add
this line to `.gitignore` to be safe:
```
serviceAccountKey.json
```

## Sending a broadcast

Sending goes through Expo's own push service, not Firebase Cloud
Messaging directly — EAS already manages the FCM relay underneath it
using the `google-services.json` already in this project, so there's
nothing extra to configure there. The service account key above is only
used to *read* the token list from Firestore.

From a computer with Node.js (this doesn't need to run on your phone):
```bash
npm install firebase-admin expo-server-sdk
node scripts/send-broadcast.js "UrgeAway" "Your message here"
```

That sends to every device currently registered in `pushTokens`. Dead
tokens (app uninstalled, etc.) get cleaned up automatically each time you
run it.
