pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "nizalo-android"

include(":app")
include(":core:model")
include(":core:common")
include(":core:security")
include(":core:network")
include(":core:realtime")
include(":core:designsystem")
include(":game-engines")
include(":feature:auth")
include(":feature:home")
include(":feature:games")
include(":feature:play")
include(":feature:tournaments")
include(":feature:ranking")
include(":feature:profile")
include(":feature:wallet")
include(":feature:support")
include(":feature:updater")
