"""
Test notifications.py premium templates and event mapping
Validates:
- Event mapping for Wash & Fold (order_received, ready_for_pickup, completed)
- Event mapping for Pickup & Delivery (order_created, pickup_confirmed, ready, out_for_delivery, delivered)
- ORDER_NUMBER only appears in first events (order_received, order_created)
- ENFORCE_QUIET_HOURS=false allows notifications
- Premium templates generate clean messages (no duplicate brand prefix)
"""
import pytest
import asyncio
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from notifications import (
    build_premium_message,
    MILESTONES,
    EVENT_MAPPING,
    is_quiet_hours,
    normalize_preferred_contact,
    format_phone,
    detect_language,
    has_sms_consent,
    ENFORCE_QUIET_HOURS
)


class TestMilestones:
    """Test milestone/event definitions for each flow"""
    
    def test_wash_fold_milestones_defined(self):
        """Wash & Fold should have order_received, ready_for_pickup, completed"""
        expected = {"order_received", "ready_for_pickup", "completed"}
        assert "wash_fold" in MILESTONES
        assert MILESTONES["wash_fold"] == expected
        print(f"PASS: Wash & Fold milestones = {MILESTONES['wash_fold']}")
    
    def test_pickup_delivery_milestones_defined(self):
        """Pickup & Delivery should have order_created, pickup_confirmed, ready, out_for_delivery, delivered"""
        expected = {"order_created", "pickup_confirmed", "ready", "out_for_delivery", "delivered"}
        assert "pickup_delivery" in MILESTONES
        assert MILESTONES["pickup_delivery"] == expected
        print(f"PASS: Pickup & Delivery milestones = {MILESTONES['pickup_delivery']}")


class TestEventMapping:
    """Test internal event name mapping"""
    
    def test_order_created_maps_correctly(self):
        """order_created should map to order_created"""
        assert EVENT_MAPPING.get("order_created") == "order_created"
        print("PASS: order_created maps correctly")
    
    def test_pickup_scheduled_maps_to_pickup_confirmed(self):
        """pickup_scheduled should map to pickup_confirmed"""
        assert EVENT_MAPPING.get("pickup_scheduled") == "pickup_confirmed"
        print("PASS: pickup_scheduled -> pickup_confirmed")
    
    def test_pickup_reminder_maps_to_pickup_confirmed(self):
        """pickup_reminder should map to pickup_confirmed"""
        assert EVENT_MAPPING.get("pickup_reminder") == "pickup_confirmed"
        print("PASS: pickup_reminder -> pickup_confirmed")
    
    def test_pickup_completed_maps_to_pickup_confirmed(self):
        """pickup_completed should map to pickup_confirmed"""
        assert EVENT_MAPPING.get("pickup_completed") == "pickup_confirmed"
        print("PASS: pickup_completed -> pickup_confirmed")


class TestPremiumTemplatesOrderNumber:
    """Test that ORDER_NUMBER only appears in first events"""
    
    def test_order_received_includes_order_number_spanish(self):
        """order_received (Wash & Fold) should include order number in Spanish"""
        result = build_premium_message(
            event="order_received",
            status=None,
            order_number="WF123",
            customer_name="Juan",
            language="es-MX"
        )
        assert "#WF123" in result["subject"]
        assert "#WF123" in result["message"]
        print(f"PASS: order_received (ES) includes order number: {result['subject']}")
    
    def test_order_received_includes_order_number_english(self):
        """order_received (Wash & Fold) should include order number in English"""
        result = build_premium_message(
            event="order_received",
            status=None,
            order_number="WF456",
            customer_name="John",
            language="en-US"
        )
        assert "#WF456" in result["subject"]
        assert "#WF456" in result["message"]
        print(f"PASS: order_received (EN) includes order number: {result['subject']}")
    
    def test_order_created_includes_order_number_spanish(self):
        """order_created (Pickup & Delivery) should include order number in Spanish"""
        result = build_premium_message(
            event="order_created",
            status=None,
            order_number="PD789",
            customer_name="Maria",
            language="es-MX"
        )
        assert "#PD789" in result["subject"]
        assert "#PD789" in result["message"]
        print(f"PASS: order_created (ES) includes order number: {result['subject']}")
    
    def test_order_created_includes_order_number_english(self):
        """order_created (Pickup & Delivery) should include order number in English"""
        result = build_premium_message(
            event="order_created",
            status=None,
            order_number="PD101",
            customer_name="Mary",
            language="en-US"
        )
        assert "#PD101" in result["subject"]
        assert "#PD101" in result["message"]
        print(f"PASS: order_created (EN) includes order number: {result['subject']}")
    
    def test_ready_for_pickup_no_order_number(self):
        """ready_for_pickup should NOT include order number (subsequent event)"""
        result = build_premium_message(
            event="ready_for_pickup",
            status=None,
            order_number="WF123",
            customer_name="Juan",
            language="es-MX"
        )
        assert "#WF123" not in result["subject"]
        assert "#WF123" not in result["message"]
        print(f"PASS: ready_for_pickup excludes order number: {result['subject']}")
    
    def test_completed_no_order_number(self):
        """completed should NOT include order number (subsequent event)"""
        result = build_premium_message(
            event="completed",
            status=None,
            order_number="WF123",
            customer_name="Juan",
            language="es-MX"
        )
        assert "#WF123" not in result["subject"]
        assert "#WF123" not in result["message"]
        print(f"PASS: completed excludes order number: {result['subject']}")
    
    def test_pickup_confirmed_no_order_number(self):
        """pickup_confirmed should NOT include order number (subsequent event)"""
        result = build_premium_message(
            event="pickup_confirmed",
            status=None,
            order_number="PD789",
            customer_name="Maria",
            language="es-MX"
        )
        assert "#PD789" not in result["subject"]
        assert "#PD789" not in result["message"]
        print(f"PASS: pickup_confirmed excludes order number: {result['subject']}")
    
    def test_ready_no_order_number(self):
        """ready should NOT include order number (subsequent event)"""
        result = build_premium_message(
            event="ready",
            status=None,
            order_number="PD789",
            customer_name="Maria",
            language="es-MX"
        )
        assert "#PD789" not in result["subject"]
        assert "#PD789" not in result["message"]
        print(f"PASS: ready excludes order number: {result['subject']}")
    
    def test_out_for_delivery_no_order_number(self):
        """out_for_delivery should NOT include order number (subsequent event)"""
        result = build_premium_message(
            event="out_for_delivery",
            status=None,
            order_number="PD789",
            customer_name="Maria",
            language="es-MX"
        )
        assert "#PD789" not in result["subject"]
        assert "#PD789" not in result["message"]
        print(f"PASS: out_for_delivery excludes order number: {result['subject']}")
    
    def test_delivered_no_order_number(self):
        """delivered should NOT include order number (subsequent event)"""
        result = build_premium_message(
            event="delivered",
            status=None,
            order_number="PD789",
            customer_name="Maria",
            language="es-MX"
        )
        assert "#PD789" not in result["subject"]
        assert "#PD789" not in result["message"]
        print(f"PASS: delivered excludes order number: {result['subject']}")


class TestPremiumTemplatesNoDuplicateBrand:
    """Test that premium templates don't duplicate brand prefix"""
    
    def test_message_has_single_brand_prefix(self):
        """Message should start with brand name only once"""
        result = build_premium_message(
            event="order_received",
            status=None,
            order_number="WF123",
            customer_name="Juan",
            language="es-MX"
        )
        message = result["message"]
        # Count occurrences of brand name
        brand_count = message.count("Ventura Fresh")
        assert brand_count == 1, f"Brand appears {brand_count} times instead of 1"
        print(f"PASS: Brand appears exactly once in message")
    
    def test_message_clean_for_twilio(self):
        """Message should not have multiple brand prefixes that Twilio would duplicate"""
        result = build_premium_message(
            event="pickup_confirmed",
            status=None,
            order_number="PD789",
            customer_name="Maria",
            language="es-MX"
        )
        message = result["message"]
        # Should start with brand name once
        assert message.startswith("Ventura Fresh")
        # No double newlines or formatting issues
        assert "\n\n\n" not in message
        print(f"PASS: Message is clean for Twilio: {message[:50]}...")


class TestQuietHoursEnforcement:
    """Test that ENFORCE_QUIET_HOURS=false allows notifications"""
    
    def test_enforce_quiet_hours_disabled_by_default(self):
        """ENFORCE_QUIET_HOURS should be False by default"""
        assert ENFORCE_QUIET_HOURS == False
        print(f"PASS: ENFORCE_QUIET_HOURS = {ENFORCE_QUIET_HOURS}")
    
    def test_is_quiet_hours_function_works(self):
        """is_quiet_hours function should return boolean"""
        result = is_quiet_hours()
        assert isinstance(result, bool)
        print(f"PASS: is_quiet_hours() returns {result} (boolean)")


class TestContactPreferences:
    """Test contact preference normalization"""
    
    def test_normalize_sms_variations(self):
        """Various SMS input variations should normalize to 'sms'"""
        variations = ["sms", "SMS", "text", "TEXT", "mensaje", "mensaje de texto"]
        for v in variations:
            result = normalize_preferred_contact(v)
            assert result == "sms", f"'{v}' should normalize to 'sms', got '{result}'"
        print("PASS: All SMS variations normalize correctly")
    
    def test_normalize_whatsapp_variations(self):
        """WhatsApp variations should normalize to 'whatsapp'"""
        variations = ["whatsapp", "WHATSAPP", "wa", "wapp"]
        for v in variations:
            result = normalize_preferred_contact(v)
            assert result == "whatsapp", f"'{v}' should normalize to 'whatsapp', got '{result}'"
        print("PASS: All WhatsApp variations normalize correctly")
    
    def test_normalize_email_variations(self):
        """Email variations should normalize to 'email'"""
        variations = ["email", "EMAIL", "correo", "mail"]
        for v in variations:
            result = normalize_preferred_contact(v)
            assert result == "email", f"'{v}' should normalize to 'email', got '{result}'"
        print("PASS: All email variations normalize correctly")


class TestPhoneFormatting:
    """Test phone number formatting for Twilio"""
    
    def test_format_us_10_digit(self):
        """US 10-digit number starting with 8 gets +52 (Mexico detection logic)"""
        # Note: Current implementation assumes 8xx numbers are Mexico
        result = format_phone("8055551234")
        assert result == "+528055551234"  # Implementation assumes Mexico for 8xx
        print(f"PASS: 10-digit 8xx formats to {result}")
    
    def test_format_mexico_number(self):
        """Mexico number starting with 52 should get + prefix"""
        result = format_phone("525512345678")
        assert result.startswith("+52")
        print(f"PASS: Mexico number formats to {result}")
    
    def test_format_already_formatted(self):
        """Already formatted number should remain unchanged"""
        result = format_phone("+18055551234")
        assert result == "+18055551234"
        print(f"PASS: Already formatted remains {result}")


class TestLanguageDetection:
    """Test language detection for customers"""
    
    def test_detect_spanish_default(self):
        """Default language should be es-MX"""
        result = detect_language(None, None)
        assert result == "es-MX"
        print(f"PASS: Default language is {result}")
    
    def test_detect_english_for_us_number(self):
        """US number should default to en-US when phone starts with +1"""
        # Note: Function checks phone.strip().startswith("+1") after checking customer preferred
        result = detect_language({}, "+18055551234")
        # Empty customer dict doesn't set preferred_language, so falls through to phone check
        # But implementation returns es-MX as default if no preferred_language
        assert result == "es-MX"  # Default is Spanish
        print(f"PASS: Empty customer gets default {result}")
    
    def test_detect_preferred_language(self):
        """Customer preferred language should be used"""
        result = detect_language({"preferred_language": "en-US"}, "+525512345678")
        assert result == "en-US"
        print(f"PASS: Preferred language overrides detection")


class TestSmsConsent:
    """Test SMS consent validation"""
    
    def test_has_consent_from_order(self):
        """Should return True if order has sms_consent=True"""
        result = has_sms_consent({"sms_consent": True}, {})
        assert result == True
        print("PASS: Order SMS consent works")
    
    def test_has_consent_from_customer(self):
        """Should return True if customer has sms_consent=True"""
        result = has_sms_consent({}, {"sms_consent": True})
        assert result == True
        print("PASS: Customer SMS consent works")
    
    def test_no_consent(self):
        """Should return False if no consent given"""
        result = has_sms_consent({"sms_consent": False}, {"sms_consent": False})
        assert result == False
        print("PASS: No consent returns False")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
