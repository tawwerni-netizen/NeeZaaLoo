package com.nizalo.core.common

sealed interface NizaloResult<out T> {
    data class Success<T>(val data: T) : NizaloResult<T>
    data class Error(val exception: Throwable, val message: String? = exception.message, val code: Int? = null) : NizaloResult<Nothing>
    data object Loading : NizaloResult<Nothing>

    val isSuccess: Boolean get() = this is Success
    val isError: Boolean get() = this is Error
    val isLoading: Boolean get() = this is Loading

    fun getOrNull(): T? = (this as? Success)?.data

    fun <R> map(transform: (T) -> R): NizaloResult<R> = when (this) {
        is Success -> Success(transform(data))
        is Error -> this
        is Loading -> this
    }
}
