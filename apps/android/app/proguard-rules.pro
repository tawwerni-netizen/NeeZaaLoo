# Nizalo Android Proguard Rules

# KotlinX Serialization
-keepattributes *Annotation*,InnerClasses
-dontnote kotlinx.serialization.SerializationKt
-keepclassmembers class * {
    *** Companion;
}
-keepclasseswithmembers class * {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep Data Models and DTOs
-keep class com.nizalo.core.model.** { *; }
-keep class com.nizalo.core.network.dto.** { *; }
-keep class com.nizalo.core.realtime.** { *; }

# OkHttp & Retrofit
-dontwarn okhttp3.**
-dontwarn retrofit2.**
-dontwarn okio.**

# Compose
-dontwarn androidx.compose.**
