package com.nizalo.feature.social

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.*
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.nizalo.core.designsystem.*

@Composable
fun SocialTabsScreen(
    chatViewModel: ChatViewModel
) {
    var selectedTabIndex by remember { mutableIntStateOf(0) }
    val tabs = listOf("Chat", "Friends", "Notifications")

    Column(modifier = Modifier.fillMaxSize().background(ObsidianBg)) {
        TabRow(
            selectedTabIndex = selectedTabIndex,
            containerColor = SurfaceDark,
            contentColor = GoldAccent,
            indicator = { tabPositions ->
                TabRowDefaults.Indicator(
                    Modifier.tabIndicatorOffset(tabPositions[selectedTabIndex]),
                    color = GoldAccent
                )
            }
        ) {
            tabs.forEachIndexed { index, title ->
                Tab(
                    selected = selectedTabIndex == index,
                    onClick = { selectedTabIndex = index },
                    text = { Text(title, color = if (selectedTabIndex == index) GoldAccent else TextSecondary) }
                )
            }
        }

        when (selectedTabIndex) {
            0 -> ChatScreen(viewModel = chatViewModel)
            1 -> FriendsScreen()
            2 -> NotificationsScreen()
        }
    }
}
