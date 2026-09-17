package com.nizalo.paymentreceiver

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.nizalo.paymentreceiver.api.PendingWithdrawalsResponse
import com.nizalo.paymentreceiver.api.RetrofitClient
import com.nizalo.paymentreceiver.service.ObserverForegroundService
import kotlinx.coroutines.launch

val DarkGreenBg = Color(0xFF08140E)
val CardGreen = Color(0xFF10281C)
val PrimaryGreen = Color(0xFF4ADE80)
val TextGray = Color(0xFFA1A1AA)

class MainActivity : ComponentActivity() {

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions[Manifest.permission.RECEIVE_SMS] == true) {
            startObserverService()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        requestPermissions()
        
        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                MaterialTheme(
                    colorScheme = darkColorScheme(
                        background = DarkGreenBg,
                        surface = CardGreen,
                        primary = PrimaryGreen,
                        onPrimary = Color.Black,
                        onBackground = Color.White,
                        onSurface = Color.White
                    )
                ) {
                    Surface(
                        modifier = Modifier.fillMaxSize(),
                        color = MaterialTheme.colorScheme.background
                    ) {
                        MainScreen(
                            onStartService = { startObserverService() },
                            onStopService = { stopObserverService() }
                        )
                    }
                }
            }
        }
    }

    private fun requestPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        
        val missingPermissions = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        
        if (missingPermissions.isNotEmpty()) {
            requestPermissionLauncher.launch(missingPermissions.toTypedArray())
        } else {
            startObserverService()
        }
    }

    private fun startObserverService() {
        val intent = Intent(this, ObserverForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun stopObserverService() {
        val intent = Intent(this, ObserverForegroundService::class.java)
        stopService(intent)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(onStartService: () -> Unit, onStopService: () -> Unit) {
    var selectedTab by remember { mutableStateOf(0) }
    
    Scaffold(
        bottomBar = {
            NavigationBar(containerColor = CardGreen) {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Text("📋") },
                    label = { Text("السجل") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = PrimaryGreen,
                        selectedTextColor = PrimaryGreen,
                        indicatorColor = DarkGreenBg,
                        unselectedIconColor = TextGray,
                        unselectedTextColor = TextGray
                    )
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Text("💸") },
                    label = { Text("طلبات السحب") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = PrimaryGreen,
                        selectedTextColor = PrimaryGreen,
                        indicatorColor = DarkGreenBg,
                        unselectedIconColor = TextGray,
                        unselectedTextColor = TextGray
                    )
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Text("⚙️") },
                    label = { Text("الإعدادات") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = PrimaryGreen,
                        selectedTextColor = PrimaryGreen,
                        indicatorColor = DarkGreenBg,
                        unselectedIconColor = TextGray,
                        unselectedTextColor = TextGray
                    )
                )
            }
        },
        topBar = {
            TopAppBar(
                title = { Text("مستقبل مدفوعات Nizalo", fontWeight = FontWeight.Bold, color = Color.White) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = DarkGreenBg)
            )
        }
    ) { paddingValues ->
        Box(modifier = Modifier.padding(paddingValues).fillMaxSize()) {
            when (selectedTab) {
                0 -> LogTab(onStartService, onStopService)
                1 -> WithdrawalsTab()
                2 -> SettingsTab()
            }
        }
    }
}

@Composable
fun LogTab(onStartService: () -> Unit, onStopService: () -> Unit) {
    Column(modifier = Modifier.padding(16.dp).fillMaxSize()) {
        Card(
            colors = CardDefaults.cardColors(containerColor = CardGreen),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("حالة الخدمة", color = TextGray, fontSize = 14.sp)
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = onStartService, colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen, contentColor = Color.Black), modifier = Modifier.weight(1f)) {
                        Text("تشغيل")
                    }
                    Button(onClick = onStopService, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF3F3F46), contentColor = Color.White), modifier = Modifier.weight(1f)) {
                        Text("إيقاف")
                    }
                }
            }
        }
        
        Text("يتم تسجيل الرسائل تلقائياً وإرسالها للمنصة.", color = TextGray, fontSize = 14.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
fun WithdrawalsTab() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("nizalo_prefs", Context.MODE_PRIVATE) }
    val apiKey = prefs.getString("device_api_key", "") ?: ""
    val scope = rememberCoroutineScope()
    
    var withdrawals by remember { mutableStateOf<List<PendingWithdrawalsResponse.Withdrawal>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf("") }
    
    val fetchWithdrawals = {
        if (apiKey.isNotEmpty()) {
            isLoading = true
            errorMsg = ""
            scope.launch {
                try {
                    val response = RetrofitClient.api.getPendingWithdrawals(apiKey)
                    if (response.isSuccessful && response.body()?.ok == true) {
                        withdrawals = response.body()?.withdrawals ?: emptyList()
                    } else {
                        errorMsg = "فشل في جلب البيانات: ${response.code()}"
                    }
                } catch (e: Exception) {
                    errorMsg = "خطأ في الاتصال: ${e.message}"
                } finally {
                    isLoading = false
                }
            }
        } else {
            errorMsg = "برجاء إدخال توكن الاتصال في الإعدادات أولاً."
        }
    }
    
    LaunchedEffect(Unit) {
        fetchWithdrawals()
    }
    
    Column(modifier = Modifier.padding(16.dp).fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("طلبات السحب المعلقة", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Button(onClick = { fetchWithdrawals() }, colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen, contentColor = Color.Black)) {
                Text("تحديث")
            }
        }
        
        if (isLoading) {
            CircularProgressIndicator(color = PrimaryGreen, modifier = Modifier.align(Alignment.CenterHorizontally).padding(32.dp))
        } else if (errorMsg.isNotEmpty()) {
            Text(errorMsg, color = Color.Red, modifier = Modifier.padding(16.dp))
        } else if (withdrawals.isEmpty()) {
            Text("لا توجد طلبات سحب معلقة.", color = TextGray, modifier = Modifier.padding(16.dp))
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(withdrawals) { w ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = CardGreen),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("المبلغ: ${(w.amountMinor.toLong() / 100.0)} ج.م", fontWeight = FontWeight.Bold, color = Color.White)
                                Text(w.network, color = PrimaryGreen, fontSize = 12.sp)
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Text("الرقم: ${w.destination}", color = Color.White)
                                Button(
                                    onClick = {
                                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                        val clip = ClipData.newPlainText("Phone Number", w.destination)
                                        clipboard.setPrimaryClip(clip)
                                        Toast.makeText(context, "تم نسخ الرقم", Toast.LENGTH_SHORT).show()
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF3F3F46), contentColor = Color.White)
                                ) {
                                    Text("نسخ")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SettingsTab() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("nizalo_prefs", Context.MODE_PRIVATE) }
    
    var apiKey by remember { mutableStateOf(prefs.getString("device_api_key", "") ?: "") }
    var receivingNumberId by remember { mutableStateOf(prefs.getString("receiving_number_id", "") ?: "") }

    Column(modifier = Modifier.padding(16.dp).fillMaxSize()) {
        OutlinedTextField(
            value = apiKey,
            onValueChange = { apiKey = it },
            label = { Text("توكن الاتصال (API Key)") },
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = PrimaryGreen,
                focusedLabelColor = PrimaryGreen,
                unfocusedBorderColor = TextGray
            )
        )
        
        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = receivingNumberId,
            onValueChange = { receivingNumberId = it },
            label = { Text("معرفات الاستقبال (مثال: vf_1,insta_1)") },
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = PrimaryGreen,
                focusedLabelColor = PrimaryGreen,
                unfocusedBorderColor = TextGray
            )
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Button(
            onClick = {
                prefs.edit()
                    .putString("device_api_key", apiKey.trim())
                    .putString("receiving_number_id", receivingNumberId.trim())
                    .apply()
                Toast.makeText(context, "تم الحفظ", Toast.LENGTH_SHORT).show()
            },
            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen, contentColor = Color.Black),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("حفظ الإعدادات")
        }
    }
}
