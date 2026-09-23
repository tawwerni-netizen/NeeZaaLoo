package com.nizalo.paymentreceiver.ui.components

import androidx.annotation.StringRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.nizalo.paymentreceiver.R
import com.nizalo.paymentreceiver.data.network.ApiError
import com.nizalo.paymentreceiver.data.repo.ConnectionState
import com.nizalo.paymentreceiver.ui.theme.Brand
import com.nizalo.paymentreceiver.ui.theme.LocalStatusColors
import com.nizalo.paymentreceiver.ui.theme.Numeric

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppTopBar(
    title: String,
    onBack: (() -> Unit)? = null,
    trailing: @Composable () -> Unit = {},
) {
    TopAppBar(
        title = { Text(title, style = MaterialTheme.typography.titleLarge) },
        navigationIcon = {
            if (onBack != null) {
                IconButton(onClick = onBack, modifier = Modifier.testTag("back")) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.back))
                }
            }
        },
        actions = { trailing() },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = Brand.Ink, titleContentColor = Brand.Paper,
            navigationIconContentColor = Brand.Paper, actionIconContentColor = Brand.Paper,
        ),
    )
}

@Composable
fun BrandMark(modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(R.drawable.ic_nizalo_mark_on_dark),
        contentDescription = null,
        modifier = modifier.size(28.dp),
    )
}

/** Dot plus words: the state is readable without colour. */
@Composable
fun ConnectionPill(state: ConnectionState, modifier: Modifier = Modifier) {
    val c = LocalStatusColors.current
    val (label, dot) = when (state) {
        is ConnectionState.Online -> stringResource(if (state.mock) R.string.conn_mock else R.string.conn_online) to c.successFg
        is ConnectionState.Offline -> stringResource(R.string.conn_offline) to c.dangerFg
        ConnectionState.Checking -> stringResource(R.string.conn_checking) to c.warningFg
        ConnectionState.Unknown -> stringResource(R.string.conn_unknown) to c.neutralFg
    }
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(Color(0x22FFFFFF))
            .padding(horizontal = 10.dp, vertical = 5.dp)
            .testTag("connection_pill")
            .semantics { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(9.dp).clip(CircleShape).background(dot))
        Spacer(Modifier.width(6.dp))
        Text(label, color = Brand.Paper, style = MaterialTheme.typography.labelMedium)
    }
}

enum class Tone { SUCCESS, INFO, WARNING, DANGER, NEUTRAL }

@Composable
private fun toneColors(tone: Tone): Pair<Color, Color> {
    val c = LocalStatusColors.current
    return when (tone) {
        Tone.SUCCESS -> c.successFg to c.successBg
        Tone.INFO -> c.infoFg to c.infoBg
        Tone.WARNING -> c.warningFg to c.warningBg
        Tone.DANGER -> c.dangerFg to c.dangerBg
        Tone.NEUTRAL -> c.neutralFg to c.neutralBg
    }
}

@Composable
fun Chip(text: String, tone: Tone, modifier: Modifier = Modifier) {
    val (fg, bg) = toneColors(tone)
    Text(
        text,
        color = fg,
        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
        modifier = modifier.clip(RoundedCornerShape(6.dp)).background(bg).padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

@Composable
fun SectionCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) { Column(Modifier.padding(16.dp)) { content() } }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onBackground,
        modifier = modifier.padding(top = 8.dp, bottom = 8.dp),
    )
}

@Composable
fun EmptyState(icon: ImageVector, text: String, hint: String? = null, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(vertical = 32.dp, horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(40.dp))
        Spacer(Modifier.padding(6.dp))
        Text(text, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center)
        if (hint != null) {
            Text(hint, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        }
    }
}

/** A button that shows its own loading state and cannot be pressed twice while busy. */
@Composable
fun ActionButton(
    text: String,
    busyText: String,
    busy: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    primary: Boolean = true,
    enabled: Boolean = true,
    icon: ImageVector? = null,
) {
    val content: @Composable () -> Unit = {
        if (busy) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = if (primary) Color.White else MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(10.dp))
            Text(busyText)
        } else {
            if (icon != null) {
                Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
            }
            Text(text)
        }
    }
    val m = modifier.heightIn(min = 52.dp)
    if (primary) {
        Button(onClick = onClick, enabled = enabled && !busy, modifier = m, shape = RoundedCornerShape(10.dp)) { content() }
    } else {
        OutlinedButton(
            onClick = onClick, enabled = enabled && !busy, modifier = m, shape = RoundedCornerShape(10.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface),
        ) { content() }
    }
}

/** The outcome of an action, spelled out line by line. */
@Composable
fun ResultCard(tone: Tone, title: String, lines: List<String>, modifier: Modifier = Modifier, onDismiss: (() -> Unit)? = null) {
    val (fg, bg) = toneColors(tone)
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(bg).border(1.dp, fg.copy(alpha = 0.25f), RoundedCornerShape(10.dp))
            .padding(14.dp).testTag("result_card"),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, color = fg, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            if (onDismiss != null) TextButton(onClick = onDismiss) { Text("✕", color = fg) }
        }
        for (line in lines) Text(line, color = fg, style = MaterialTheme.typography.bodyMedium.merge(Numeric))
    }
}

@Composable
fun Banner(tone: Tone, title: String, body: String?, actionText: String? = null, onAction: (() -> Unit)? = null) {
    val (fg, bg) = toneColors(tone)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(bg).padding(12.dp)) {
        Text(title, color = fg, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
        if (body != null) Text(body, color = fg, style = MaterialTheme.typography.bodyMedium)
        if (actionText != null && onAction != null) {
            TextButton(onClick = onAction, contentPadding = ButtonDefaults.TextButtonContentPadding) {
                Text(actionText, color = fg, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun LabeledValue(label: String, value: String?, copyable: Boolean = false, onCopied: (() -> Unit)? = null) {
    val clipboard = LocalClipboardManager.current
    Row(
        Modifier.fillMaxWidth().padding(vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(0.42f))
        Row(Modifier.weight(0.58f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.End) {
            Text(
                value ?: "—",
                style = MaterialTheme.typography.bodyLarge.merge(Numeric),
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.End,
                modifier = Modifier.weight(1f, fill = false),
            )
            if (copyable && !value.isNullOrBlank()) {
                IconButton(onClick = { clipboard.setText(AnnotatedString(value)); onCopied?.invoke() }, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Filled.ContentCopy, contentDescription = stringResource(R.string.copy), modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}

@Composable
fun StatTile(label: String, value: Int, modifier: Modifier = Modifier, tag: String) {
    Column(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp, vertical = 14.dp)
            .testTag(tag),
    ) {
        Text(value.toString(), style = MaterialTheme.typography.headlineSmall.merge(Numeric), color = MaterialTheme.colorScheme.onSurface)
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
    }
}

@Composable
fun NavTile(icon: ImageVector, label: String, badge: Int = 0, onClick: () -> Unit, modifier: Modifier = Modifier, tag: String) {
    Column(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .heightIn(min = 76.dp)
            .padding(10.dp)
            .testTag(tag),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface)
            if (badge > 0) {
                Text(
                    badge.toString(),
                    color = Color.White,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.align(Alignment.TopEnd).padding(start = 18.dp)
                        .clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.primary).padding(horizontal = 5.dp),
                )
            }
        }
        Spacer(Modifier.padding(2.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, textAlign = TextAlign.Center, maxLines = 2)
    }
}

@Composable
fun apiErrorText(e: ApiError): String = when (e) {
    ApiError.NotConfigured -> stringResource(R.string.err_not_configured)
    ApiError.NoInternet -> stringResource(R.string.err_no_internet)
    ApiError.Timeout -> stringResource(R.string.err_timeout)
    ApiError.ServerUnavailable -> stringResource(R.string.err_server_unavailable)
    ApiError.SslError -> stringResource(R.string.err_ssl)
    ApiError.Unauthorized -> stringResource(R.string.err_unauthorized)
    ApiError.DeviceDisabled -> stringResource(R.string.err_device_disabled)
    ApiError.RateLimited -> stringResource(R.string.err_rate_limited)
    ApiError.EndpointMissing -> stringResource(R.string.err_endpoint_missing)
    ApiError.InvalidResponse -> stringResource(R.string.err_invalid_response)
    ApiError.WifiRequired -> stringResource(R.string.err_wifi_required)
    is ApiError.Server -> stringResource(R.string.err_server, e.httpCode)
    is ApiError.Rejected -> stringResource(R.string.err_rejected, e.code)
    else -> stringResource(R.string.err_invalid_response)
}

@StringRes
fun errorCodeText(code: String?): Int? = when (code) {
    "NO_RECEIVING_NUMBER" -> R.string.err_no_receiving_number
    "NO_INTERNET" -> R.string.err_no_internet
    "TIMEOUT" -> R.string.err_timeout
    "SERVER_UNAVAILABLE" -> R.string.err_server_unavailable
    "UNAUTHORIZED" -> R.string.err_unauthorized
    "DEVICE_DISABLED" -> R.string.err_device_disabled
    "RATE_LIMITED" -> R.string.err_rate_limited
    "ENDPOINT_MISSING" -> R.string.err_endpoint_missing
    "NOT_CONFIGURED" -> R.string.err_not_configured
    "SSL_ERROR" -> R.string.err_ssl
    "WIFI_REQUIRED" -> R.string.err_wifi_required
    else -> null
}
