package com.nizalo.paymentreceiver.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.sp

/**
 * Brand neutrals (ink #0B0D10 / paper #F2F4F7) carry the interface; the
 * signal orange is reserved for the primary action, in its deep variant
 * (#CC3A14) so white text on it stays readable.
 */
object Brand {
    val Ink = Color(0xFF0B0D10)
    val InkRaised = Color(0xFF15181D)
    val Paper = Color(0xFFF2F4F7)
    val Signal = Color(0xFFFF5A2B)
    val SignalDeep = Color(0xFFCC3A14)
}

/** Semantic status colours. Every use is paired with a text label; colour is never the only signal. */
@Immutable
data class StatusColors(
    val successFg: Color, val successBg: Color,
    val infoFg: Color, val infoBg: Color,
    val warningFg: Color, val warningBg: Color,
    val dangerFg: Color, val dangerBg: Color,
    val neutralFg: Color, val neutralBg: Color,
)

private val LightStatus = StatusColors(
    successFg = Color(0xFF157F4A), successBg = Color(0xFFE3F4EA),
    infoFg = Color(0xFF1D4ED8), infoBg = Color(0xFFE6EEFD),
    warningFg = Color(0xFF8A5300), warningBg = Color(0xFFFFF1D6),
    dangerFg = Color(0xFFB42318), dangerBg = Color(0xFFFDE9E7),
    neutralFg = Color(0xFF545B66), neutralBg = Color(0xFFE7EAEF),
)

private val DarkStatus = StatusColors(
    successFg = Color(0xFF6FD79E), successBg = Color(0xFF12301F),
    infoFg = Color(0xFF93B4FA), infoBg = Color(0xFF16233F),
    warningFg = Color(0xFFF5C46B), warningBg = Color(0xFF33260C),
    dangerFg = Color(0xFFF59B91), dangerBg = Color(0xFF3A1714),
    neutralFg = Color(0xFFB4BAC4), neutralBg = Color(0xFF23272E),
)

val LocalStatusColors = staticCompositionLocalOf { LightStatus }

private val LightColors = lightColorScheme(
    primary = Brand.SignalDeep, onPrimary = Color.White,
    secondary = Brand.Ink, onSecondary = Color.White,
    background = Brand.Paper, onBackground = Brand.Ink,
    surface = Color.White, onSurface = Brand.Ink,
    surfaceVariant = Color(0xFFF7F8FA), onSurfaceVariant = Color(0xFF545B66),
    outline = Color(0xFFC9CFD8), outlineVariant = Color(0xFFE2E5EA),
    error = Color(0xFFB42318), onError = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = Brand.Signal, onPrimary = Brand.Ink,
    secondary = Brand.Paper, onSecondary = Brand.Ink,
    background = Brand.Ink, onBackground = Brand.Paper,
    surface = Brand.InkRaised, onSurface = Brand.Paper,
    surfaceVariant = Color(0xFF1C2027), onSurfaceVariant = Color(0xFF9BA3AF),
    outline = Color(0xFF3A404A), outlineVariant = Color(0xFF2A2F37),
    error = Color(0xFFF59B91), onError = Brand.Ink,
)

private val AppTypography = Typography().run {
    copy(
        headlineSmall = headlineSmall.copy(fontWeight = FontWeight.Bold, fontSize = 22.sp),
        titleLarge = titleLarge.copy(fontWeight = FontWeight.Bold, fontSize = 20.sp),
        titleMedium = titleMedium.copy(fontWeight = FontWeight.SemiBold, fontSize = 16.sp),
        bodyLarge = bodyLarge.copy(fontSize = 16.sp, lineHeight = 24.sp),
        bodyMedium = bodyMedium.copy(fontSize = 14.sp, lineHeight = 21.sp),
        labelLarge = labelLarge.copy(fontWeight = FontWeight.SemiBold, fontSize = 15.sp),
    )
}

/** Amounts and references line up in columns. */
val Numeric = TextStyle(fontFeatureSettings = "tnum")

@Composable
fun ReceiverTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    CompositionLocalProvider(
        // Arabic-first: RTL regardless of the phone's system language.
        LocalLayoutDirection provides LayoutDirection.Rtl,
        LocalStatusColors provides if (dark) DarkStatus else LightStatus,
    ) {
        MaterialTheme(colorScheme = if (dark) DarkColors else LightColors, typography = AppTypography, content = content)
    }
}
