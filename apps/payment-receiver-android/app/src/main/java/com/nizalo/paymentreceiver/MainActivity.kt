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
import com.nizalo.paymentreceiver.api.CompleteWithdrawalRequest
import com.nizalo.paymentreceiver.api.PendingDepositsResponse
import com.nizalo.paymentreceiver.api.PendingWithdrawalsResponse
import com.nizalo.paymentreceiver.api.RetrofitClient
import com.nizalo.paymentreceiver.service.ObserverForegroundService
import kotlinx.coroutines.launch

// Nizalo's own design tokens (packages/tokens/tokens.css, Calm Luxury Dark
// theme) -- not a green scheme invented for this app. --nz-bg, --nz-surface-2,
// --nz-accent ("Duel Orange", the one brand color used everywhere), --nz-text-2.
val NizaloBg = Color(0xFF0B0E14)
val NizaloSurface = Color(0xFF181F2C)
val NizaloAccent = Color(0xFFFF5A2B)
val NizaloAccentContrast = Color(0xFFFFFFFF)
val NizaloTextMuted = Color(0xFF94A3B8)

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

        // A tap on the "New Withdrawal Request" notification (ObserverForegroundService)
        // carries this extra so the operator lands straight on the withdrawals list
        // instead of the log tab it opens to by default.
        val initialTab = if (intent?.getBooleanExtra(EXTRA_OPEN_WITHDRAWALS, false) == true) 2 else 0

        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                MaterialTheme(
                    colorScheme = darkColorScheme(
                        background = NizaloBg,
                        surface = NizaloSurface,
                        primary = NizaloAccent,
                        onPrimary = NizaloAccentContrast,
                        onBackground = Color.White,
                        onSurface = Color.White
                    )
                ) {
                    Surface(
                        modifier = Modifier.fillMaxSize(),
                        color = MaterialTheme.colorScheme.background
                    ) {
                        MainScreen(
                            initialTab = initialTab,
                            onStartService = { startObserverService() },
                            onStopService = { stopObserverService() }
                        )
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        // singleTask (manifest) means a notification tap while the app is
        // already running lands here instead of a fresh onCreate; recreate()
        // is the simplest way to re-read EXTRA_OPEN_WITHDRAWALS and land on
        // the right tab without hand-rolling Compose navigation state.
        recreate()
    }

    companion object {
        const val EXTRA_OPEN_WITHDRAWALS = "open_withdrawals"
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
fun MainScreen(initialTab: Int = 0, onStartService: () -> Unit, onStopService: () -> Unit) {
    var selectedTab by remember { mutableStateOf(initialTab) }
    
    Scaffold(
        bottomBar = {
            NavigationBar(containerColor = NizaloSurface) {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Text("📋") },
                    label = { Text("السجل") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = NizaloAccent,
                        selectedTextColor = NizaloAccent,
                        indicatorColor = NizaloBg,
                        unselectedIconColor = NizaloTextMuted,
                        unselectedTextColor = NizaloTextMuted
                    )
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Text("📥") },
                    label = { Text("الإيداعات") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = NizaloAccent,
                        selectedTextColor = NizaloAccent,
                        indicatorColor = NizaloBg,
                        unselectedIconColor = NizaloTextMuted,
                        unselectedTextColor = NizaloTextMuted
                    )
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Text("💸") },
                    label = { Text("طلبات السحب") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = NizaloAccent,
                        selectedTextColor = NizaloAccent,
                        indicatorColor = NizaloBg,
                        unselectedIconColor = NizaloTextMuted,
                        unselectedTextColor = NizaloTextMuted
                    )
                )
                NavigationBarItem(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    icon = { Text("⚙️") },
                    label = { Text("الإعدادات") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = NizaloAccent,
                        selectedTextColor = NizaloAccent,
                        indicatorColor = NizaloBg,
                        unselectedIconColor = NizaloTextMuted,
                        unselectedTextColor = NizaloTextMuted
                    )
                )
                NavigationBarItem(
                    selected = selectedTab == 4,
                    onClick = { selectedTab = 4 },
                    icon = { Text("🧪") },
                    label = { Text("اختبار") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = NizaloAccent,
                        selectedTextColor = NizaloAccent,
                        indicatorColor = NizaloBg,
                        unselectedIconColor = NizaloTextMuted,
                        unselectedTextColor = NizaloTextMuted
                    )
                )
            }
        },
        topBar = {
            TopAppBar(
                title = { Text("مستقبل مدفوعات Nizalo", fontWeight = FontWeight.Bold, color = Color.White) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = NizaloBg)
            )
        }
    ) { paddingValues ->
        Box(modifier = Modifier.padding(paddingValues).fillMaxSize()) {
            when (selectedTab) {
                0 -> LogTab(onStartService, onStopService)
                1 -> DepositsTab()
                2 -> WithdrawalsTab()
                3 -> SettingsTab()
                4 -> TestModeTab()
            }
        }
    }
}

@Composable
fun LogTab(onStartService: () -> Unit, onStopService: () -> Unit) {
    Column(modifier = Modifier.padding(16.dp).fillMaxSize()) {
        Card(
            colors = CardDefaults.cardColors(containerColor = NizaloSurface),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("حالة الخدمة", color = NizaloTextMuted, fontSize = 14.sp)
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = onStartService, colors = ButtonDefaults.buttonColors(containerColor = NizaloAccent, contentColor = NizaloAccentContrast), modifier = Modifier.weight(1f)) {
                        Text("تشغيل")
                    }
                    Button(onClick = onStopService, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF3F3F46), contentColor = Color.White), modifier = Modifier.weight(1f)) {
                        Text("إيقاف")
                    }
                }
            }
        }
        
        Text("يتم تسجيل الرسائل تلقائياً وإرسالها للمنصة.", color = NizaloTextMuted, fontSize = 14.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
}

/** EGP piastres (2 decimals) -> a display string, e.g. "500.00 ج.م". */
private fun egpFromPiastres(amountEgpMinor: String): String {
    val v = amountEgpMinor.toLongOrNull() ?: return "$amountEgpMinor ج.م"
    return "%.2f ج.م".format(v / 100.0)
}

private val NETWORK_LABELS = mapOf("VODAFONE_CASH" to "فودافون كاش", "INSTAPAY" to "إنستاباي")

@Composable
fun DepositsTab() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("nizalo_prefs", Context.MODE_PRIVATE) }
    val apiKey = prefs.getString("device_api_key", "") ?: ""
    val serverUrl = prefs.getString("server_url", "https://nizalo.com") ?: "https://nizalo.com"
    val scope = rememberCoroutineScope()

    var deposits by remember { mutableStateOf<List<PendingDepositsResponse.Deposit>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf("") }

    val fetchDeposits = {
        if (apiKey.isNotEmpty()) {
            isLoading = true
            errorMsg = ""
            scope.launch {
                try {
                    val response = RetrofitClient.getApi(serverUrl).getPendingDeposits(apiKey)
                    if (response.isSuccessful && response.body()?.ok == true) {
                        deposits = response.body()?.deposits ?: emptyList()
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
        fetchDeposits()
    }

    Column(modifier = Modifier.padding(16.dp).fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("طلبات الإيداع المعلقة", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Button(onClick = { fetchDeposits() }, colors = ButtonDefaults.buttonColors(containerColor = NizaloAccent, contentColor = NizaloAccentContrast)) {
                Text("تحديث")
            }
        }

        Text(
            "هذه طلبات أعلنها لاعبون بأنهم سيرسلون مبلغاً -- يتم مطابقتها وقيدها تلقائياً بمجرد وصول الرسالة، الشاشة دي للمتابعة فقط.",
            color = NizaloTextMuted, fontSize = 12.sp, modifier = Modifier.padding(bottom = 12.dp)
        )

        if (isLoading) {
            CircularProgressIndicator(color = NizaloAccent, modifier = Modifier.align(Alignment.CenterHorizontally).padding(32.dp))
        } else if (errorMsg.isNotEmpty()) {
            Text(errorMsg, color = Color.Red, modifier = Modifier.padding(16.dp))
        } else if (deposits.isEmpty()) {
            Text("لا توجد طلبات إيداع معلقة.", color = NizaloTextMuted, modifier = Modifier.padding(16.dp))
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(deposits) { d ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = NizaloSurface),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(egpFromPiastres(d.amountEgpMinor), fontWeight = FontWeight.Bold, color = Color.White)
                                Text(NETWORK_LABELS[d.network] ?: d.network, color = NizaloAccent, fontSize = 12.sp)
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text("المرسل: ${d.senderName} (${d.senderPhone})", color = NizaloTextMuted, fontSize = 13.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun WithdrawalsTab() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("nizalo_prefs", Context.MODE_PRIVATE) }
    val apiKey = prefs.getString("device_api_key", "") ?: ""
    val serverUrl = prefs.getString("server_url", "https://nizalo.com") ?: "https://nizalo.com"
    val scope = rememberCoroutineScope()

    var withdrawals by remember { mutableStateOf<List<PendingWithdrawalsResponse.Withdrawal>>(emptyList()) }
    var egpPerUsd by remember { mutableStateOf<Double?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf("") }
    var withdrawalPendingReference by remember { mutableStateOf<PendingWithdrawalsResponse.Withdrawal?>(null) }
    var completingId by remember { mutableStateOf<String?>(null) }

    val fetchWithdrawals = {
        if (apiKey.isNotEmpty()) {
            isLoading = true
            errorMsg = ""
            scope.launch {
                try {
                    val response = RetrofitClient.getApi(serverUrl).getPendingWithdrawals(apiKey)
                    if (response.isSuccessful && response.body()?.ok == true) {
                        withdrawals = response.body()?.withdrawals ?: emptyList()
                        egpPerUsd = response.body()?.rate?.egpPerUsd
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

    withdrawalPendingReference?.let { w ->
        CompleteWithdrawalDialog(
            withdrawal = w,
            isSubmitting = completingId == w.id,
            onDismiss = { if (completingId == null) withdrawalPendingReference = null },
            onConfirm = { reference ->
                completingId = w.id
                scope.launch {
                    try {
                        val res = RetrofitClient.getApi(serverUrl)
                            .completeWithdrawal(apiKey, w.id, CompleteWithdrawalRequest(reference))
                        if (res.isSuccessful && res.body()?.ok == true) {
                            withdrawals = withdrawals.filter { it.id != w.id }
                            withdrawalPendingReference = null
                            Toast.makeText(context, "تم تأكيد التحويل وخصم الرصيد", Toast.LENGTH_LONG).show()
                        } else {
                            Toast.makeText(context, "فشل التأكيد: ${res.code()} ${res.errorBody()?.string()}", Toast.LENGTH_LONG).show()
                        }
                    } catch (e: Exception) {
                        Toast.makeText(context, "خطأ في الاتصال: ${e.message}", Toast.LENGTH_LONG).show()
                    } finally {
                        completingId = null
                    }
                }
            }
        )
    }

    Column(modifier = Modifier.padding(16.dp).fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("طلبات السحب المعلقة", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Button(onClick = { fetchWithdrawals() }, colors = ButtonDefaults.buttonColors(containerColor = NizaloAccent, contentColor = NizaloAccentContrast)) {
                Text("تحديث")
            }
        }

        if (egpPerUsd == null && !isLoading && withdrawals.isNotEmpty()) {
            Text(
                "⚠ لم يتم ضبط سعر الصرف بعد -- المبالغ أدناه بالدولار فقط.",
                color = NizaloAccent, fontSize = 13.sp, modifier = Modifier.padding(bottom = 8.dp)
            )
        }

        if (isLoading) {
            CircularProgressIndicator(color = NizaloAccent, modifier = Modifier.align(Alignment.CenterHorizontally).padding(32.dp))
        } else if (errorMsg.isNotEmpty()) {
            Text(errorMsg, color = Color.Red, modifier = Modifier.padding(16.dp))
        } else if (withdrawals.isEmpty()) {
            Text("لا توجد طلبات سحب معلقة.", color = NizaloTextMuted, modifier = Modifier.padding(16.dp))
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(withdrawals) { w ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = NizaloSurface),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(egpLabel(w.amountMinor, egpPerUsd), fontWeight = FontWeight.Bold, color = Color.White)
                                Text(w.network, color = NizaloAccent, fontSize = 12.sp)
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
                            Spacer(modifier = Modifier.height(8.dp))
                            Button(
                                onClick = { withdrawalPendingReference = w },
                                enabled = completingId == null,
                                colors = ButtonDefaults.buttonColors(containerColor = NizaloAccent, contentColor = NizaloAccentContrast),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(if (completingId == w.id) "جارٍ التأكيد..." else "تم التحويل ✓")
                            }
                        }
                    }
                }
            }
        }
    }
}

/** USDT minor units (6 decimals) -> a display string. EGP when a rate is set, USD otherwise. */
private fun egpLabel(amountMinor: String, egpPerUsd: Double?): String {
    val usdt = amountMinor.toLongOrNull()?.div(1_000_000.0) ?: return "المبلغ: $amountMinor"
    return if (egpPerUsd != null) {
        "المبلغ: %.2f ج.م (%.2f USDT)".format(usdt * egpPerUsd, usdt)
    } else {
        "المبلغ: %.2f USDT".format(usdt)
    }
}

@Composable
fun CompleteWithdrawalDialog(
    withdrawal: PendingWithdrawalsResponse.Withdrawal,
    isSubmitting: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (reference: String) -> Unit
) {
    var reference by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = NizaloSurface,
        title = { Text("تأكيد تحويل ${withdrawal.destination}", color = Color.White) },
        text = {
            Column {
                Text(
                    "اكتب رقم العملية أو أي ملاحظة تساعدك على تتبع هذا التحويل لاحقاً. لا يمكن التراجع بعد التأكيد -- سيتم خصم الرصيد من حساب اللاعب فوراً.",
                    color = NizaloTextMuted, fontSize = 13.sp
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = reference,
                    onValueChange = { reference = it },
                    label = { Text("مرجع التحويل") },
                    enabled = !isSubmitting,
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = NizaloAccent, focusedLabelColor = NizaloAccent, unfocusedBorderColor = NizaloTextMuted
                    )
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(reference.trim().ifEmpty { "Manual transfer via Payment Receiver app, ${withdrawal.destination}" }) },
                enabled = !isSubmitting,
                colors = ButtonDefaults.buttonColors(containerColor = NizaloAccent, contentColor = NizaloAccentContrast)
            ) { Text(if (isSubmitting) "..." else "تأكيد الخصم") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSubmitting) { Text("إلغاء", color = NizaloTextMuted) }
        }
    )
}

@Composable
fun SettingsTab() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("nizalo_prefs", Context.MODE_PRIVATE) }
    
    var serverUrl by remember { mutableStateOf(prefs.getString("server_url", "https://nizalo.com") ?: "https://nizalo.com") }
    var apiKey by remember { mutableStateOf(prefs.getString("device_api_key", "") ?: "") }
    var receivingNumberId by remember { mutableStateOf(prefs.getString("receiving_number_id", "") ?: "") }

    Column(modifier = Modifier.padding(16.dp).fillMaxSize()) {
        OutlinedTextField(
            value = serverUrl,
            onValueChange = { serverUrl = it },
            label = { Text("رابط الموقع (مثال: https://nizalo.com)") },
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = NizaloAccent,
                focusedLabelColor = NizaloAccent,
                unfocusedBorderColor = NizaloTextMuted
            )
        )
        
        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = apiKey,
            onValueChange = { apiKey = it },
            label = { Text("توكن الاتصال (API Key)") },
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = NizaloAccent,
                focusedLabelColor = NizaloAccent,
                unfocusedBorderColor = NizaloTextMuted
            )
        )
        
        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = receivingNumberId,
            onValueChange = { receivingNumberId = it },
            label = { Text("معرفات الاستقبال (مثال: vf_1,insta_1)") },
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = NizaloAccent,
                focusedLabelColor = NizaloAccent,
                unfocusedBorderColor = NizaloTextMuted
            )
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Button(
            onClick = {
                prefs.edit()
                    .putString("server_url", serverUrl.trim())
                    .putString("device_api_key", apiKey.trim())
                    .putString("receiving_number_id", receivingNumberId.trim())
                    .apply()
                Toast.makeText(context, "تم الحفظ", Toast.LENGTH_SHORT).show()
            },
            colors = ButtonDefaults.buttonColors(containerColor = NizaloAccent, contentColor = NizaloAccentContrast),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("حفظ الإعدادات")
        }
    }
}

@Composable
fun TestModeTab() {
    val context = LocalContext.current
    var smsText by remember { mutableStateOf("") }
    var resultText by remember { mutableStateOf("") }

    Column(modifier = Modifier.padding(16.dp).fillMaxSize()) {
        Text("وضع اختبار الرسائل (Regex Testing)", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.White, modifier = Modifier.padding(bottom = 16.dp))

        OutlinedTextField(
            value = smsText,
            onValueChange = { smsText = it },
            label = { Text("نص الرسالة (SMS)") },
            modifier = Modifier.fillMaxWidth().height(150.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = NizaloAccent,
                focusedLabelColor = NizaloAccent,
                unfocusedBorderColor = NizaloTextMuted
            )
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Button(
            onClick = {
                if (smsText.isBlank()) {
                    resultText = "الرجاء إدخال نص الرسالة"
                    return@Button
                }
                val parsed = com.nizalo.paymentreceiver.sms.SmsParser.parseAny(smsText)
                if (parsed != null) {
                    val (network, data) = parsed
                    resultText = """
                        الشبكة: $network
                        المبلغ (قروش): ${data.amountEgpMinor}
                        رقم المرسل: ${data.senderPhone ?: "غير متوفر"}
                        اسم المرسل: ${data.senderName ?: "غير متوفر"}
                        المرجع (Transaction Ref): ${data.transactionRef ?: "غير متوفر"}
                    """.trimIndent()
                } else {
                    resultText = "لم يتم التعرف على الرسالة كإيصال دفع (Vodafone Cash / InstaPay)."
                }
            },
            colors = ButtonDefaults.buttonColors(containerColor = NizaloAccent, contentColor = NizaloAccentContrast),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("اختبار")
        }

        Spacer(modifier = Modifier.height(24.dp))

        if (resultText.isNotEmpty()) {
            Card(
                colors = CardDefaults.cardColors(containerColor = NizaloSurface),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = resultText,
                    color = Color.White,
                    modifier = Modifier.padding(16.dp)
                )
            }
        }
    }
}

