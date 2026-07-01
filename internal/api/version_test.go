package api

import "testing"

func TestCompareVersions(t *testing.T) {
	h := &VersionHandler{}

	cases := []struct {
		name    string
		current string
		latest  string
		want    bool
	}{
		{"stable_vs_older_beta_same_base", "v4.0.2", "v4.0.2-beta1", false},
		{"stable_vs_same_stable", "v4.0.2", "v4.0.2", false},
		{"stable_vs_higher_patch", "v4.0.2", "v4.0.3", true},
		{"stable_vs_higher_minor", "v4.0.2", "v4.1.2", true},
		{"stable_vs_higher_major", "v4.0.2", "v5.0.0", true},
		{"stable_vs_higher_beta", "v4.0.2", "v4.1.0-beta1", true},
		{"beta_vs_higher_beta_same_base", "v4.0.2-beta1", "v4.0.2-beta2", true},
		{"beta_vs_same_beta", "v4.0.2-beta1", "v4.0.2-beta1", false},
		{"beta_vs_lower_beta_same_base", "v4.0.2-beta2", "v4.0.2-beta1", false},
		{"beta_vs_stable_same_base", "v4.0.2-beta1", "v4.0.2", true},
		{"beta_vs_higher_patch_stable", "v4.0.2-beta1", "v4.0.3", true},
		{"no_v_prefix_current", "4.0.2", "v4.0.2-beta1", false},
		{"dev_always_updates", "dev", "v0.0.1", true},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := h.compareVersions(c.current, c.latest)
			if got != c.want {
				t.Errorf("compareVersions(%q, %q) = %v, want %v", c.current, c.latest, got, c.want)
			}
		})
	}
}
