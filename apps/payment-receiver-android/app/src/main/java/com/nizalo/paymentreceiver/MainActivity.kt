package com.nizalo.paymentreceiver

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.nizalo.paymentreceiver.service.ObserverForegroundService

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
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    AppUI(
                        onStartService = { startObserverService() },
                        onStopService = { stopObserverService() }
                    )
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

@Composable
fun AppUI(onStartService: () -> Unit, onStopService: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val prefs = remember { context.getSharedPreferences("nizalo_prefs", Context.MODE_PRIVATE) }
    
    var apiKey by remember { mutableStateOf(prefs.getString("device_api_key", "") ?: "") }
    var receivingNumberId by remember { mutableStateOf(prefs.getString("receiving_number_id", "") ?: "") }
    var statusText by remember { mutableStateOf("Not Configured") }

    Column(modifier = Modifier.padding(16.dp)) {
        Text("Payment Receiver Setup", style = MaterialTheme.typography.headlineMedium)
        
        Spacer(modifier = Modifier.height(16.dp))
        
        OutlinedTextField(
            value = apiKey,
            onValueChange = { apiKey = it },
            label = { Text("Device API Key") },
            modifier = Modifier.fillMaxWidth()
        )
        
        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(
            value = receivingNumberId,
            onValueChange = { receivingNumberId = it },
            label = { Text("Receiving Number IDs (comma-separated, e.g., vf_1,insta_1)") },
            modifier = Modifier.fillMaxWidth()
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Button(onClick = {
                prefs.edit()
                    .putString("device_api_key", apiKey.trim())
                    .putString("receiving_number_id", receivingNumberId.trim())
                    .apply()
                statusText = "Configured. Ready to start."
            }) {
                Text("Save Configuration")
            }
        }
        
        Spacer(modifier = Modifier.height(32.dp))
        
        Text("Service Status: $statusText", style = MaterialTheme.typography.bodyLarge)
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { 
                onStartService()
                statusText = "Running"
            }) {
                Text("Start Service")
            }
            Button(onClick = { 
                onStopService()
                statusText = "Stopped"
            }, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)) {
                Text("Stop Service")
            }
        }
    }
}
