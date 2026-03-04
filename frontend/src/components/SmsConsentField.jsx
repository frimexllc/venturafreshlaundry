import { Link } from "react-router-dom";
import { useLocale } from "../context/LocaleContext";

export default function SmsConsentField({ checked, onChange, idPrefix = "sms-consent" }) {
  const { t } = useLocale();

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid={`${idPrefix}-container`}>
      <label className="flex items-start gap-2 cursor-pointer" data-testid={`${idPrefix}-label`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600"
          data-testid={`${idPrefix}-checkbox`}
        />
        <span className="text-sm text-slate-700" data-testid={`${idPrefix}-text`}>
          {t(
            "I agree to receive SMS notifications from Ventura Fresh Laundry.",
            "Acepto recibir notificaciones SMS de Ventura Fresh Laundry."
          )}
          <br />
          {t(
            "Message frequency may vary. Message and data rates may apply.",
            "La frecuencia de mensajes puede variar. Pueden aplicar tarifas de mensajes y datos."
          )}
          <br />
          {t("Reply STOP to opt out. Reply HELP for help.", "Responde STOP para cancelar. Responde HELP para ayuda.")}
          {" "}
          <Link to="/sms-policy-consent" className="text-sky-600 hover:underline" data-testid={`${idPrefix}-policy-link`}>
            {t("SMS Policy", "Política SMS")}
          </Link>
        </span>
      </label>
    </div>
  );
}
