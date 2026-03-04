import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"
import { useLocale } from "@/context/LocaleContext";

const BUTTON_TRANSLATIONS = {
  "Save": "Guardar",
  "Update": "Actualizar",
  "Create": "Crear",
  "Delete": "Eliminar",
  "Cancel": "Cancelar",
  "Confirm": "Confirmar",
  "Submit": "Enviar",
  "Close": "Cerrar",
  "Next": "Siguiente",
  "Previous": "Anterior",
  "Back": "Volver",
  "Continue": "Continuar",
  "Search": "Buscar",
  "Filter": "Filtrar",
  "Export": "Exportar",
  "Import": "Importar",
  "Refresh": "Actualizar",
  "Retry": "Reintentar",
  "Print": "Imprimir",
  "Request payment": "Solicitar pago",
  "Pay with Stripe": "Pagar con Stripe",
  "Confirm order": "Confirmar orden",
  "Add": "Agregar",
  "Remove": "Quitar",
  "Clear": "Limpiar",
  "Open": "Abrir",
  "Edit": "Editar",
  "New": "Nuevo"
};

const translateButtonTextNode = (node, locale) => {
  if (locale !== "es") return node;

  if (typeof node === "string") {
    const trimmed = node.trim();
    if (!trimmed) return node;
    const translated = BUTTON_TRANSLATIONS[trimmed];
    if (!translated) return node;
    return node.replace(trimmed, translated);
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => (
      <React.Fragment key={index}>{translateButtonTextNode(child, locale)}</React.Fragment>
    ));
  }

  return node;
};

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, autoTranslate = true, children, ...props }, ref) => {
  const { locale } = useLocale();
  const Comp = asChild ? Slot : "button"

  const translatedChildren = autoTranslate
    ? translateButtonTextNode(children, locale)
    : children;

  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    >
      {translatedChildren}
    </Comp>
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
