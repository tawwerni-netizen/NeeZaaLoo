package com.nizalo.feature.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nizalo.core.designsystem.*
import com.nizalo.core.model.*

@Composable
fun WalletScreen(
    balance: WalletBalance?,
    transactions: List<WalletTransaction>,
    onRequestDepositIntent: (CryptoNetwork) -> Unit,
    onRequestWithdrawal: (amountUsdt: Double, address: String, network: CryptoNetwork, totp: String) -> Unit
) {
    var showDepositModal by remember { mutableStateOf(false) }
    var showWithdrawModal by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianBg)
            .padding(16.dp)
            .verticalScroll(rememberScrollState())
    ) {
        Text("Nizalo Wallet", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
        Text("Zero-Custody Transparent USDT Ledger", fontSize = 13.sp, color = TextSecondary)

        Spacer(modifier = Modifier.height(16.dp))

        // Balance Card
        NizaloCard {
            Text("Available Balance", color = TextSecondary, fontSize = 13.sp)
            Text(
                text = "$${String.format("%.2f", balance?.availableUsdt ?: 0.0)} USDT",
                fontSize = 32.sp,
                fontWeight = FontWeight.Black,
                color = GoldAccent
            )

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("Locked in Duels: $${String.format("%.2f", balance?.lockedInDuelsUsdt ?: 0.0)}", color = TextSecondary, fontSize = 12.sp)
                Text("Pending: $${String.format("%.2f", balance?.totalPendingDepositUsdt ?: 0.0)}", color = AzureBlue, fontSize = 12.sp)
            }

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(
                    onClick = { showDepositModal = true },
                    colors = ButtonDefaults.buttonColors(containerColor = EmeraldGreen, contentColor = TextPrimary),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.weight(1f).height(48.dp)
                ) {
                    Text("Deposit USDT", fontWeight = FontWeight.Bold)
                }

                Button(
                    onClick = { showWithdrawModal = true },
                    colors = ButtonDefaults.buttonColors(containerColor = SurfaceElevated, contentColor = TextPrimary),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.weight(1f).height(48.dp)
                ) {
                    Text("Withdraw", fontWeight = FontWeight.Bold)
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // Transactions Header
        Text("Transaction History", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
        Spacer(modifier = Modifier.height(8.dp))

        if (transactions.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(120.dp)
                    .background(SurfaceDark, RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text("No transactions yet", color = TextSecondary)
            }
        } else {
            transactions.forEach { tx ->
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
                        Column {
                            Text(tx.description, fontWeight = FontWeight.SemiBold, color = TextPrimary, fontSize = 13.sp)
                            Text("Status: ${tx.status.name}", color = if (tx.status == TransactionStatus.COMPLETED) EmeraldGreen else AzureBlue, fontSize = 11.sp)
                        }
                        Text(
                            text = "${if (tx.type == TransactionType.DEPOSIT || tx.type == TransactionType.DUEL_PRIZE_PAYOUT || tx.type == TransactionType.REFERRAL_REWARD) "+" else "-"}$${tx.amountUsdt} USDT",
                            fontWeight = FontWeight.Bold,
                            color = if (tx.type == TransactionType.DEPOSIT || tx.type == TransactionType.DUEL_PRIZE_PAYOUT || tx.type == TransactionType.REFERRAL_REWARD) EmeraldGreen else RubyRed,
                            fontSize = 14.sp
                        )
                    }
                }
            }
        }
    }

    // Deposit Modal
    if (showDepositModal) {
        var selectedNetwork by remember { mutableStateOf(CryptoNetwork.TRON_TRC20) }
        AlertDialog(
            onDismissRequest = { showDepositModal = false },
            title = { Text("Deposit USDT", color = GoldAccent, fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    Text("Select Network:", color = TextSecondary, fontSize = 12.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    CryptoNetwork.entries.forEach { net ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            RadioButton(
                                selected = selectedNetwork == net,
                                onClick = { selectedNetwork = net },
                                colors = RadioButtonDefaults.colors(selectedColor = GoldAccent)
                            )
                            Text("${net.networkName} (Min $${net.minDepositUsdt.toInt()})", color = TextPrimary, fontSize = 13.sp)
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        onRequestDepositIntent(selectedNetwork)
                        showDepositModal = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = EmeraldGreen, contentColor = TextPrimary)
                ) {
                    Text("Generate Address")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDepositModal = false }) { Text("Cancel") }
            },
            containerColor = SurfaceDark
        )
    }

    // Withdrawal Modal
    if (showWithdrawModal) {
        var amount by remember { mutableStateOf("") }
        var address by remember { mutableStateOf("") }
        var totp by remember { mutableStateOf("") }
        var selectedNetwork by remember { mutableStateOf(CryptoNetwork.TRON_TRC20) }

        AlertDialog(
            onDismissRequest = { showWithdrawModal = false },
            title = { Text("Withdraw USDT", color = GoldAccent, fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    OutlinedTextField(
                        value = amount,
                        onValueChange = { amount = it },
                        label = { Text("Amount USDT (Min $10)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = address,
                        onValueChange = { address = it },
                        label = { Text("Destination Address") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = totp,
                        onValueChange = { totp = it },
                        label = { Text("6-Digit 2FA TOTP Code") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val amt = amount.toDoubleOrNull()
                        if (amt != null && amt >= 10.0 && address.isNotBlank() && totp.length == 6) {
                            onRequestWithdrawal(amt, address, selectedNetwork, totp)
                            showWithdrawModal = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = GoldAccent, contentColor = ObsidianBg)
                ) {
                    Text("Submit Withdrawal")
                }
            },
            dismissButton = {
                TextButton(onClick = { showWithdrawModal = false }) { Text("Cancel") }
            },
            containerColor = SurfaceDark
        )
    }
}
