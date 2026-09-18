package com.nizalo.feature.auth

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.collectAsState
import com.nizalo.core.designsystem.GoldAccent
import com.nizalo.core.designsystem.NizaloPrimaryButton
import com.nizalo.core.designsystem.ObsidianBg
import com.nizalo.core.designsystem.SurfaceDark
import com.nizalo.core.network.StepUpManager
import androidx.compose.runtime.collectAsState

@Composable
fun StepUpDialogRoute(
    stepUpManager: StepUpManager,
    viewModel: AuthViewModel
) {
    val currentAction by stepUpManager.stepUpRequests.collectAsState(initial = null)

    if (currentAction != null) {
        StepUpDialog(
            action = currentAction!!,
            onConfirm = { password, totp ->
                viewModel.stepUp(currentAction!!, password, totp, stepUpManager)
            },
            onDismiss = {
                stepUpManager.onStepUpResolved(null)
            }
        )
    }
}

@Composable
fun StepUpDialog(
    action: String,
    onConfirm: (String, String?) -> Unit,
    onDismiss: () -> Unit
) {
    var password by remember { mutableStateOf("") }
    var totpCode by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Security Verification Required",
                fontWeight = FontWeight.Bold,
                color = GoldAccent
            )
        },
        text = {
            Column {
                Text("This action ($action) requires you to re-verify your password.")
                Spacer(modifier = Modifier.height(16.dp))
                
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                
                Spacer(modifier = Modifier.height(8.dp))
                
                OutlinedTextField(
                    value = totpCode,
                    onValueChange = { totpCode = it },
                    label = { Text("2FA Code (if enabled)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
            }
        },
        confirmButton = {
            NizaloPrimaryButton(
                text = "Verify",
                onClick = {
                    onConfirm(password, totpCode.takeIf { it.isNotBlank() })
                },
                enabled = password.isNotBlank()
            )
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = MaterialTheme.colorScheme.error)
            }
        },
        containerColor = SurfaceDark,
        shape = RoundedCornerShape(16.dp)
    )
}
