package com.nizalo.feature.support

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
fun SupportScreen(
    tickets: List<SupportTicket>,
    onCreateTicket: (category: SupportCategory, subject: String, message: String) -> Unit,
    onReplyTicket: (ticketId: String, message: String) -> Unit
) {
    var showCreateDialog by remember { mutableStateOf(false) }
    var selectedCategoryForFaq by remember { mutableStateOf<SupportCategory?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianBg)
            .padding(16.dp)
            .verticalScroll(rememberScrollState())
    ) {
        Text("Help Center & Support", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
        Text("Browse categories or open a ticket with support", fontSize = 13.sp, color = TextSecondary)

        Spacer(modifier = Modifier.height(16.dp))

        // Category Cards Grid
        Text("Browse Help Topics", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
        Spacer(modifier = Modifier.height(8.dp))

        SupportCategory.entries.forEach { category ->
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 3.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(SurfaceDark)
                    .clickable { selectedCategoryForFaq = category }
                    .padding(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(category.displayName, color = TextPrimary, fontSize = 14.sp)
                    Text("→", color = GoldAccent, fontWeight = FontWeight.Bold)
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // Open Tickets Section
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Your Support Tickets", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
            Button(
                onClick = { showCreateDialog = true },
                colors = ButtonDefaults.buttonColors(containerColor = GoldAccent, contentColor = ObsidianBg),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text("+ New Ticket", fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        if (tickets.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(100.dp)
                    .background(SurfaceDark, RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text("No active tickets", color = TextSecondary)
            }
        } else {
            tickets.forEach { ticket ->
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp)
                        .background(SurfaceDark, RoundedCornerShape(10.dp))
                        .padding(12.dp)
                ) {
                    Column {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(ticket.subject, fontWeight = FontWeight.Bold, color = TextPrimary, fontSize = 14.sp)
                            NizaloBadge(
                                text = ticket.status.name,
                                color = if (ticket.status == TicketStatus.ANSWERED) EmeraldGreen else SurfaceElevated,
                                textColor = if (ticket.status == TicketStatus.ANSWERED) ObsidianBg else TextPrimary
                            )
                        }
                        Text("Category: ${ticket.category.displayName}", color = TextSecondary, fontSize = 12.sp)
                    }
                }
            }
        }
    }

    if (showCreateDialog) {
        var subject by remember { mutableStateOf("") }
        var message by remember { mutableStateOf("") }
        var category by remember { mutableStateOf(SupportCategory.ACCOUNT) }

        AlertDialog(
            onDismissRequest = { showCreateDialog = false },
            title = { Text("Open Support Ticket", color = GoldAccent, fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    OutlinedTextField(
                        value = subject,
                        onValueChange = { subject = it },
                        label = { Text("Subject") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = message,
                        onValueChange = { message = it },
                        label = { Text("Describe your issue...") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 3
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (subject.isNotBlank() && message.isNotBlank()) {
                            onCreateTicket(category, subject, message)
                            showCreateDialog = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = GoldAccent, contentColor = ObsidianBg)
                ) {
                    Text("Submit Ticket")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCreateDialog = false }) { Text("Cancel") }
            },
            containerColor = SurfaceDark
        )
    }
}
