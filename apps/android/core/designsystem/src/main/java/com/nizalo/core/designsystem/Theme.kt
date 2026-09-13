package com.nizalo.core.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable

private val NizaloDarkColorScheme = darkColorScheme(
    primary = GoldAccent,
    onPrimary = ObsidianBg,
    primaryContainer = SurfaceElevated,
    onPrimaryContainer = GoldAccent,
    secondary = AzureBlue,
    onSecondary = ObsidianBg,
    background = ObsidianBg,
    onBackground = TextPrimary,
    surface = SurfaceDark,
    onSurface = TextPrimary,
    surfaceVariant = SurfaceElevated,
    onSurfaceVariant = TextSecondary,
    outline = SurfaceBorder,
    error = RubyRed,
    onError = TextPrimary
)

@Composable
fun NizaloTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = NizaloDarkColorScheme,
        content = content
    )
}
