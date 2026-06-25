package auth

import "testing"

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
