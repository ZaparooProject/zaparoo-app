# App-specific R8 rules. Capacitor and the plugins ship their own keep rules.

# Keep line numbers so Play Console can deobfuscate stack traces with the
# mapping file the app bundle carries.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# The Firebase Authentication plugin compiles in a Facebook sign-in handler.
# The App only enables Google and Apple, so the Facebook SDK isn't bundled.
-dontwarn com.facebook.**

# slf4j looks for an optional logging backend at runtime and falls back to no-op.
-dontwarn org.slf4j.impl.StaticLoggerBinder
