package com.nizalo.paymentreceiver.ui.components

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.nizalo.paymentreceiver.R

private fun requiredPermissions(): List<String> = buildList {
    add(Manifest.permission.RECEIVE_SMS)
    add(Manifest.permission.READ_SMS)
    if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
}

private fun Context.findActivity(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}

/**
 * Asks only for what the app uses, explains each, and never loops: after a
 * permanent denial the only offer is the system settings page.
 */
@Composable
fun PermissionsCard() {
    val context = LocalContext.current
    var refresh by remember { mutableIntStateOf(0) }
    var askedOnce by remember { mutableStateOf(false) }

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) refresh++ }
        lifecycle.addObserver(obs)
        onDispose { lifecycle.removeObserver(obs) }
    }

    val missing = remember(refresh) {
        requiredPermissions().filter { ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED }
    }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        askedOnce = true
        refresh++
    }
    if (missing.isEmpty()) return

    val activity = context.findActivity()
    val permanentlyDenied = askedOnce && activity != null &&
        missing.none { ActivityCompat.shouldShowRequestPermissionRationale(activity, it) }

    val reasons = buildList {
        if (Manifest.permission.RECEIVE_SMS in missing) add(stringResource(R.string.perm_sms_reason))
        if (Manifest.permission.READ_SMS in missing) add(stringResource(R.string.perm_read_sms_reason))
        if (Build.VERSION.SDK_INT >= 33 && Manifest.permission.POST_NOTIFICATIONS in missing) add(stringResource(R.string.perm_notif_reason))
    }
    SectionCard(Modifier.testTag("permissions_card")) {
        Text(stringResource(R.string.perm_title), style = MaterialTheme.typography.titleMedium)
        for (r in reasons) Text("• $r", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 6.dp))
        if (permanentlyDenied) {
            Text(stringResource(R.string.perm_denied), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
        }
        Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (!permanentlyDenied) {
                Button(onClick = { launcher.launch(missing.toTypedArray()) }, modifier = Modifier.testTag("grant_permissions")) {
                    Text(stringResource(R.string.perm_grant))
                }
            }
            OutlinedButton(onClick = {
                context.startActivity(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            }) { Text(stringResource(R.string.perm_open_settings)) }
        }
    }
}

