# kotlinx.serialization: keep generated serializers for the wire DTOs.
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions
-keepclassmembers class com.nizalo.paymentreceiver.data.network.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.nizalo.paymentreceiver.data.network.**$$serializer { *; }

# Retrofit service interface and suspend functions.
-keep,allowobfuscation,allowshrinking interface com.nizalo.paymentreceiver.data.network.PaymentApiService
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations, AnnotationDefault
-dontwarn retrofit2.**
-dontwarn okhttp3.**
-dontwarn okio.**

# SQLCipher native bindings.
-keep class net.zetetic.database.** { *; }
-keep class net.zetetic.database.sqlcipher.** { *; }

# WorkManager instantiates workers reflectively by class name.
-keep class * extends androidx.work.ListenableWorker { <init>(android.content.Context, androidx.work.WorkerParameters); }
