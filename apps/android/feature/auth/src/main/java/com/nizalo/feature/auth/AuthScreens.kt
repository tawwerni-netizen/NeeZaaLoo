package com.nizalo.feature.auth

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nizalo.core.designsystem.*
import com.nizalo.core.model.LegalPolicy

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onNavigateToRegister: () -> Unit,
    onRequiresPolicyReacceptance: (LegalPolicy) -> Unit
) {
    var usernameOrEmail by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var totpCode by remember { mutableStateOf("") }
    var showTotpField by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("NIZALO", fontSize = 36.sp, fontWeight = FontWeight.Black, color = GoldAccent)
        Text("Global Pure-Skill Arena", fontSize = 14.sp, color = TextSecondary)

        Spacer(modifier = Modifier.height(32.dp))

        NizaloCard {
            Text("Sign In", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = usernameOrEmail,
                onValueChange = { usernameOrEmail = it },
                label = { Text("Username or Email") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Spacer(modifier = Modifier.height(12.dp))

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            if (showTotpField) {
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = totpCode,
                    onValueChange = { totpCode = it },
                    label = { Text("6-Digit 2FA Code") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
            }

            if (errorMessage != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(errorMessage!!, color = RubyRed, fontSize = 12.sp)
            }

            Spacer(modifier = Modifier.height(20.dp))

            NizaloPrimaryButton(
                text = if (isLoading) "Signing in..." else "Sign In",
                onClick = {
                    if (usernameOrEmail.isBlank() || password.isBlank()) {
                        errorMessage = "Please enter username and password"
                        return@NizaloPrimaryButton
                    }
                    isLoading = true
                    // Simulate network authentication callback
                    onLoginSuccess()
                },
                enabled = !isLoading
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        Row {
            Text("Don't have an account? ", color = TextSecondary)
            Text(
                "Sign Up",
                color = GoldAccent,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable { onNavigateToRegister() }
            )
        }
    }
}

@Composable
fun RegisterScreen(
    onRegisterSuccess: () -> Unit,
    onNavigateToLogin: () -> Unit,
    onViewPolicy: (String) -> Unit
) {
    var username by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var referralCode by remember { mutableStateOf("") }
    
    // STRICT REQUIREMENT: Checkbox MUST NOT be pre-selected
    var agreedToTerms by remember { mutableStateOf(false) }
    
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Create Account", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = GoldAccent)
        Text("Join the global pure-skill competition", fontSize = 13.sp, color = TextSecondary)

        Spacer(modifier = Modifier.height(24.dp))

        NizaloCard {
            OutlinedTextField(
                value = username,
                onValueChange = { username = it },
                label = { Text("Username") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Spacer(modifier = Modifier.height(12.dp))

            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email Address") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Spacer(modifier = Modifier.height(12.dp))

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Spacer(modifier = Modifier.height(12.dp))

            OutlinedTextField(
                value = referralCode,
                onValueChange = { referralCode = it },
                label = { Text("Referral Code (Optional)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Mandatory Unselected Terms Checkbox
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Checkbox(
                    checked = agreedToTerms,
                    onCheckedChange = { agreedToTerms = it },
                    colors = CheckboxDefaults.colors(
                        checkedColor = GoldAccent,
                        uncheckedColor = SurfaceBorder,
                        checkmarkColor = ObsidianBg
                    )
                )
                Text(
                    text = "I agree to the Terms & Conditions and Privacy Policy",
                    fontSize = 12.sp,
                    color = TextPrimary,
                    modifier = Modifier.clickable { agreedToTerms = !agreedToTerms }
                )
            }

            if (errorMessage != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(errorMessage!!, color = RubyRed, fontSize = 12.sp)
            }

            Spacer(modifier = Modifier.height(20.dp))

            NizaloPrimaryButton(
                text = if (isLoading) "Creating Account..." else "Agree & Register",
                onClick = {
                    if (username.isBlank() || email.isBlank() || password.isBlank()) {
                        errorMessage = "All fields except referral code are required."
                        return@NizaloPrimaryButton
                    }
                    if (!agreedToTerms) {
                        errorMessage = "You must agree to the Terms & Conditions to proceed."
                        return@NizaloPrimaryButton
                    }
                    isLoading = true
                    onRegisterSuccess()
                },
                enabled = !isLoading && agreedToTerms
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        Row {
            Text("Already registered? ", color = TextSecondary)
            Text(
                "Sign In",
                color = GoldAccent,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable { onNavigateToLogin() }
            )
        }
    }
}

@Composable
fun PolicyReacceptanceModal(
    policy: LegalPolicy,
    onAccept: () -> Unit
) {
    AlertDialog(
        onDismissRequest = { /* Block dismiss until accepted */ },
        title = {
            Text(
                text = "Policy Update Notice",
                fontWeight = FontWeight.Bold,
                color = GoldAccent
            )
        },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Text(
                    text = policy.title,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 16.sp,
                    color = TextPrimary
                )
                Text(
                    text = "Version ${policy.version} (Updated: ${policy.lastUpdatedIso})",
                    fontSize = 11.sp,
                    color = TextSecondary
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = policy.summary,
                    fontSize = 13.sp,
                    color = TextPrimary
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "To continue playing and accessing wallet services on Nizalo, please review and accept the updated terms.",
                    fontSize = 12.sp,
                    color = TextSecondary
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onAccept,
                colors = ButtonDefaults.buttonColors(containerColor = GoldAccent, contentColor = ObsidianBg)
            ) {
                Text("Accept & Continue", fontWeight = FontWeight.Bold)
            }
        },
        containerColor = SurfaceDark,
        shape = RoundedCornerShape(16.dp)
    )
}
