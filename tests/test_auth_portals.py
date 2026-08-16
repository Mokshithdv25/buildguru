from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def test_desktop_and_mobile_expose_role_specific_auth_routes():
    for relative_path in (
        "frontend/src/App.js",
        "frontend/src/mobile/MobileAppRoutes.jsx",
    ):
        source = read(relative_path)
        assert 'path="/sign-in"' in source
        assert 'path="/join"' in source
        assert 'path="/pro/sign-in"' in source
        assert 'path="/pro/join"' in source
        assert 'portalRole="homeowner"' in source
        assert 'portalRole="pro"' in source


def test_auth_page_uses_real_supabase_phone_otp_calls():
    source = read("frontend/src/pages/SignInPage.jsx")
    assert "auth.signInWithOtp" in source
    assert "auth.verifyOtp" in source
    assert "shouldCreateUser: requestedSignUp" in source
    assert "development OTP" not in source


def test_provider_dependent_signup_methods_are_off_by_default():
    for relative_path in ("frontend/.env.example", "frontend/.env.production"):
        source = read(relative_path)
        assert "REACT_APP_EMAIL_SIGNUP_ENABLED=false" in source
        assert "REACT_APP_PHONE_AUTH_ENABLED=false" in source


def test_guards_send_users_to_the_correct_role_portal():
    assert "/pro/join?redirect=" in read("frontend/src/components/ProOnboardingGuard.jsx")
    assert "/pro/sign-in?redirect=" in read("frontend/src/components/ProDashboardGuard.jsx")
    assert "/sign-in?redirect=" in read("frontend/src/lib/requireHomeownerAuth.js")


def test_same_identity_can_enter_either_role_only_at_sign_in():
    auth = read("frontend/src/lib/hmAuth.js")
    sign_in = read("frontend/src/pages/SignInPage.jsx")
    menu = read("frontend/src/components/HmUserMenu.jsx")
    assert auth.index('signInIntent === "pro"') < auth.index("profile?.role")
    assert "switchHmMode" not in auth
    assert "switchHmMode" not in menu
    assert "profile.role !== signInIntent" not in sign_in
    assert "Sign out before entering" in sign_in
    assert "Sign out to use" in sign_in
    assert "passwordRecovery || currentSession === null" in sign_in
    assert "currentSession === undefined" in sign_in
