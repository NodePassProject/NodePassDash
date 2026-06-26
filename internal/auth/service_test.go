package auth

import (
	"NodePassDash/internal/models"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestValidateAdminCredentials(t *testing.T) {
	cases := []struct {
		name     string
		username string
		password string
		wantErr  bool
	}{
		{"OK", "admin", "Pa$$w0rd", false},
		{"username too short", "ab", "Pa$$w0rd", true},
		{"username too long", "abcdefghijklmnopqrstuvwxyz", "Pa$$w0rd", true},
		{"username with dash", "ad-min", "Pa$$w0rd", true},
		{"username with space", "ad min", "Pa$$w0rd", true},
		{"username with dot", "admin.x", "Pa$$w0rd", true},
		{"underscore OK", "ad_min", "Pa$$w0rd", false},
		{"digits OK", "admin123", "Pa$$w0rd", false},
		{"password too short", "admin", "1234567", true},
		{"password exactly 8", "admin", "12345678", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateAdminCredentials(tc.username, tc.password)
			if (err != nil) != tc.wantErr {
				t.Errorf("validateAdminCredentials(%q,%q) err=%v wantErr=%v",
					tc.username, tc.password, err, tc.wantErr)
			}
		})
	}
}

func TestConfigCacheDoesNotLeakAcrossServiceDatabases(t *testing.T) {
	openDB := func(t *testing.T) *gorm.DB {
		t.Helper()
		db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
		if err != nil {
			t.Fatalf("open sqlite: %v", err)
		}
		if err := db.AutoMigrate(&models.SystemConfig{}); err != nil {
			t.Fatalf("migrate system_configs: %v", err)
		}
		return db
	}

	initializedDB := openDB(t)
	initializedService := NewService(initializedDB)
	if err := initializedService.SetSystemConfig(ConfigKeyIsInitialized, "true"); err != nil {
		t.Fatalf("seed initialized config: %v", err)
	}
	if !initializedService.IsSystemInitialized() {
		t.Fatalf("seeded service should be initialized")
	}

	freshDB := openDB(t)
	freshService := NewService(freshDB)
	if freshService.IsSystemInitialized() {
		t.Fatalf("fresh service should not reuse initialized flag from another database")
	}
	if err := freshService.InitializeSystemWithCredentials("admin", "12345678"); err != nil {
		t.Fatalf("initialize fresh service: %v", err)
	}
}
