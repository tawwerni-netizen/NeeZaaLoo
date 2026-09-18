package com.nizalo.feature.updater

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nizalo.core.designsystem.*
import com.nizalo.core.network.dto.AppUpdateCheckResponse
import java.io.File
import java.io.InputStream
import java.security.MessageDigest

class SelfUpdateManager(private val context: Context) {

    fun verifyChecksum(apkFile: File, expectedSha256: String): Boolean {
        val digest = MessageDigest.getInstance("SHA-256")
        apkFile.inputStream().use { stream ->
            val buffer = ByteArray(8192)
            var bytesRead: Int
            while (stream.read(buffer).also { bytesRead = it } != -1) {
                digest.update(buffer, 0, bytesRead)
            }
        }
        val calculatedHex = digest.digest().joinToString("") { "%02x".format(it) }
        return calculatedHex.equals(expectedSha256, ignoreCase = true)
    }

    fun installApkSession(apkStream: InputStream, apkSize: Long): Boolean {
        return try {
            val packageInstaller = context.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            val sessionId = packageInstaller.createSession(params)
            val session = packageInstaller.openSession(sessionId)

            session.openWrite("nizalo_update.apk", 0, apkSize).use { out ->
                apkStream.copyTo(out)
                session.fsync(out)
            }

            val intent = Intent("com.nizalo.UPDATE_STATUS")
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )

            session.commit(pendingIntent.intentSender)
            session.close()
            true
        } catch (e: Exception) {
            false
        }
    }
}

@Composable
fun UpdateDialog(
    updateInfo: AppUpdateCheckResponse,
    onDownloadAndInstall: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = {
            if (!updateInfo.isMandatory) onDismiss()
        },
        title = {
            Text(
                text = if (updateInfo.isMandatory) "Mandatory App Update" else "New Version Available",
                color = GoldAccent,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column {
                Text(
                    text = "Nizalo v${updateInfo.latestVersionName}",
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimary,
                    fontSize = 15.sp
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = updateInfo.releaseNotes,
                    color = TextSecondary,
                    fontSize = 13.sp
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onDownloadAndInstall,
                colors = ButtonDefaults.buttonColors(containerColor = GoldAccent, contentColor = ObsidianBg)
            ) {
                Text("Update Now", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            if (!updateInfo.isMandatory) {
                TextButton(onClick = onDismiss) {
                    Text("Later", color = TextSecondary)
                }
            }
        },
        containerColor = SurfaceDark,
        shape = RoundedCornerShape(16.dp)
    )
}
