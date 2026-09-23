package com.nizalo.paymentreceiver.data.network

/**
 * Everything the app asks of the Nizalo backend. The rest of the app talks
 * only to this interface: [RetrofitReceiverApi] in every build, plus an
 * in-memory mock in the dev build (src/dev) for working without a server.
 */
interface ReceiverApi {
    suspend fun health(): ApiResult<HealthDto>
    suspend fun statistics(): ApiResult<StatisticsDto>
    suspend fun report(request: ReportRequest): ApiResult<ReportResponse>
    suspend fun transferStatuses(backendIds: List<String>): ApiResult<List<TransferDto>>
    suspend fun withdrawals(): ApiResult<List<WithdrawalDto>>
    suspend fun withdrawal(id: String): ApiResult<WithdrawalDto>
    suspend fun confirmWithdrawal(id: String, request: ConfirmRequest): ApiResult<ConfirmResponse>
    suspend fun receivingNumbers(): ApiResult<List<ReceivingNumberDto>>
}

/** An API that cannot be reached because the operator has not configured it yet. */
object UnconfiguredApi : ReceiverApi {
    private val err = ApiResult.Err(ApiError.NotConfigured)
    override suspend fun health() = err
    override suspend fun statistics() = err
    override suspend fun report(request: ReportRequest) = err
    override suspend fun transferStatuses(backendIds: List<String>) = err
    override suspend fun withdrawals() = err
    override suspend fun withdrawal(id: String) = err
    override suspend fun confirmWithdrawal(id: String, request: ConfirmRequest) = err
    override suspend fun receivingNumbers() = err
}
