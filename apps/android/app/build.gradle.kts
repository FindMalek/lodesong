plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "engineer.findmalek.lodesong"
    compileSdk = 34

    defaultConfig {
        applicationId = "engineer.findmalek.lodesong"
        minSdk = 26
        targetSdk = 34
        versionCode = (findProperty("versionCode") as String?)?.toInt() ?: 1
        versionName = (findProperty("versionName") as String?) ?: "0.0.0"
    }

    // The committed key only gives every build the same signature, so a new release installs over the old one. It is
    // not a secret; set these variables to sign with your own.
    signingConfigs {
        create("sideload") {
            storeFile = file(System.getenv("LODESONG_KEYSTORE") ?: "../lodesong-sideload.p12")
            storeType = "pkcs12"
            storePassword = System.getenv("LODESONG_KEYSTORE_PASSWORD") ?: "lodesong"
            keyAlias = System.getenv("LODESONG_KEY_ALIAS") ?: "lodesong"
            keyPassword = System.getenv("LODESONG_KEYSTORE_PASSWORD") ?: "lodesong"
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("sideload")
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}
