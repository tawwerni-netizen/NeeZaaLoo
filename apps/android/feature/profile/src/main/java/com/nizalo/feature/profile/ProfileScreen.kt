package com.nizalo.feature.profile

import androidx.compose.foundation.background
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nizalo.core.designsystem.*
import com.nizalo.core.model.*

@Composable
fun ProfileScreen(
    viewModel: ProfileViewModel,
    onCopyReferralLink: (String) -> Unit,
    onSupportClick: () -> Unit,
    onSettingsClick: () -> Unit,
    onLogout: () -> Unit
) {
    val state by viewModel.state.collectAsState()
    var showAntiPhishingDialog by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianBg)
            .padding(16.dp)
            .verticalScroll(rememberScrollState())
    ) {
        when (val s = state) {
            is ProfileState.Loading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = GoldAccent)
                }
            }
            is ProfileState.Error -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(s.message, color = RubyRed)
                    Spacer(modifier = Modifier.height(16.dp))
                    NizaloPrimaryButton(text = "Retry", onClick = { viewModel.loadProfileData() })
                }
            }
            is ProfileState.Success -> {
                val player = s.player
                val challenges = s.challenges
                
                // Profile Info
                NizaloCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(player.displayName ?: player.username, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                            Text("Level ${player.level} • EXP ${player.experiencePoints}", color = TextSecondary, fontSize = 12.sp)
                        }
                        NizaloBadge(text = "${player.tier.name}")
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Referral Code Box
                    Text("Your Permanent Referral Code", color = TextSecondary, fontSize = 12.sp)
                    Spacer(modifier = Modifier.height(6.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(player.referralCode ?: "NZ-REF-888", color = GoldAccent, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Button(
                            onClick = { onCopyReferralLink(player.referralCode ?: "NZ-REF-888") },
                            colors = ButtonDefaults.buttonColors(containerColor = SurfaceElevated, contentColor = GoldAccent),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("Share / Copy", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Security / Anti-Phishing Phrase
                NizaloCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("Anti-Phishing Phrase", fontWeight = FontWeight.Bold, color = TextPrimary, fontSize = 14.sp)
                            Text("Code: ${s.antiPhishingPhrase}", color = AzureBlue, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                        Button(
                            onClick = { showAntiPhishingDialog = true },
                            colors = ButtonDefaults.buttonColors(containerColor = SurfaceElevated, contentColor = TextPrimary),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("Edit", fontSize = 12.sp)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Daily Challenges
                Text("Daily Challenges", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                Spacer(modifier = Modifier.height(8.dp))

                challenges.forEach { challenge ->
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .background(SurfaceDark, RoundedCornerShape(10.dp))
                            .padding(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(challenge.title, fontWeight = FontWeight.Bold, color = TextPrimary, fontSize = 14.sp)
                                Text(challenge.description, color = TextSecondary, fontSize = 12.sp)
                                Text("Progress: ${challenge.currentProgress}/${challenge.targetProgress}", color = GoldAccent, fontSize = 11.sp)
                            }
                            Button(
                                onClick = { viewModel.claimChallenge(challenge.id) },
                                enabled = !challenge.isClaimed && challenge.currentProgress >= challenge.targetProgress,
                                colors = ButtonDefaults.buttonColors(containerColor = GoldAccent, contentColor = ObsidianBg),
                                shape = RoundedCornerShape(6.dp)
                            ) {
                                Text(if (challenge.isClaimed) "Claimed" else "+${challenge.expReward} EXP", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                Button(
                    onClick = onSupportClick,
                    colors = ButtonDefaults.buttonColors(containerColor = SurfaceElevated, contentColor = TextPrimary),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Help Center & Support", fontWeight = FontWeight.Bold)
                }

                Spacer(modifier = Modifier.height(16.dp))
                
                Button(
                    onClick = onSettingsClick,
                    colors = ButtonDefaults.buttonColors(containerColor = SurfaceElevated, contentColor = TextPrimary),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Settings", fontWeight = FontWeight.Bold)
                }

                Spacer(modifier = Modifier.height(16.dp))

                Button(
                    onClick = onLogout,
                    colors = ButtonDefaults.buttonColors(containerColor = SurfaceElevated, contentColor = RubyRed),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Sign Out", fontWeight = FontWeight.Bold)
                }

                if (showAntiPhishingDialog) {
                    var inputPhrase by remember { mutableStateOf("") }
                    AlertDialog(
                        onDismissRequest = { showAntiPhishingDialog = false },
                        title = { Text("Set Anti-Phishing Phrase", color = GoldAccent) },
                        text = {
                            Column {
                                Text("Enter a unique phrase (4-20 chars) that will be displayed on all official notifications and dialogs.", color = TextSecondary, fontSize = 12.sp)
                                Spacer(modifier = Modifier.height(12.dp))
                                OutlinedTextField(
                                    value = inputPhrase,
                                    onValueChange = { inputPhrase = it },
                                    label = { Text("Anti-Phishing Phrase") },
                                    singleLine = true
                                )
                            }
                        },
                        confirmButton = {
                            Button(
                                onClick = {
                                    if (inputPhrase.length in 4..20) {
                                        viewModel.setAntiPhishingPhrase(inputPhrase)
                                        showAntiPhishingDialog = false
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = GoldAccent, contentColor = ObsidianBg)
                            ) {
                                Text("Save")
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = { showAntiPhishingDialog = false }) { Text("Cancel") }
                        },
                        containerColor = SurfaceDark
                    )
                }
            }
        }
    }
}
