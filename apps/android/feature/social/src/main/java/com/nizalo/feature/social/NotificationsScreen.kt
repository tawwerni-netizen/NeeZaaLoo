package com.nizalo.feature.social

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nizalo.core.designsystem.*

@Composable
fun NotificationsScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianBg)
            .padding(16.dp)
    ) {
        Text("Notifications", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
        Spacer(modifier = Modifier.height(16.dp))

        // Mock Notification 1
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(SurfaceDark, RoundedCornerShape(12.dp))
                .padding(16.dp)
        ) {
            Column {
                Text("Tournament Starting Soon!", fontWeight = FontWeight.Bold, color = GoldAccent, fontSize = 14.sp)
                Spacer(modifier = Modifier.height(4.dp))
                Text("The 'Weekend Warriors' tournament begins in 10 minutes. Get ready!", color = TextPrimary, fontSize = 13.sp)
                Spacer(modifier = Modifier.height(8.dp))
                Text("Just now", color = TextSecondary, fontSize = 11.sp)
            }
        }
        
        Spacer(modifier = Modifier.height(12.dp))

        // Mock Notification 2
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(SurfaceDark, RoundedCornerShape(12.dp))
                .padding(16.dp)
        ) {
            Column {
                Text("Friend Request", fontWeight = FontWeight.Bold, color = AzureBlue, fontSize = 14.sp)
                Spacer(modifier = Modifier.height(4.dp))
                Text("Player 'DominoKing' sent you a friend request.", color = TextPrimary, fontSize = 13.sp)
                Spacer(modifier = Modifier.height(8.dp))
                Text("2 hours ago", color = TextSecondary, fontSize = 11.sp)
            }
        }
    }
}
