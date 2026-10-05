package com.nizalo.paymentreceiver.ui.components

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.nizalo.paymentreceiver.core.Formatters
import com.nizalo.paymentreceiver.data.db.TransactionEntity
import com.nizalo.paymentreceiver.ui.theme.Numeric

@Composable
fun TransactionCard(t: TransactionEntity, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .testTag("tx_${t.id}"),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    Formatters.egp(t.amountPiastres),
                    style = MaterialTheme.typography.titleLarge.merge(Numeric),
                    modifier = Modifier.weight(1f),
                )
                StatusChip(t.status)
            }
            Spacer(Modifier.padding(2.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(providerText(t.provider), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface)
                Text("•", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    listOfNotNull(t.senderName, t.senderPhone).joinToString(" · ").ifEmpty { "—" },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    "# " + (t.reference ?: "—"),
                    style = MaterialTheme.typography.bodySmall.merge(Numeric),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "${Formatters.date(t.receivedAt)}  ${Formatters.time(t.receivedAt)}  ·  ${syncStatusText(t.syncStatus)}",
                    style = MaterialTheme.typography.bodySmall.merge(Numeric).copy(fontWeight = FontWeight.Normal),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
