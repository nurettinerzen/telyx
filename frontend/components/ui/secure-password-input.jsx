import * as React from "react"
import { cn } from "@/lib/utils"
import { Eye, EyeOff } from "lucide-react"

/**
 * SecurePasswordInput - A password input that prevents DevTools type attribute manipulation
 *
 * Security features:
 * 1. MutationObserver watches for type attribute changes and reverts them
 * 2. Input is cleared if type is changed to prevent password exposure
 * 3. Optional show/hide toggle with controlled visibility
 */
const SecurePasswordInput = React.forwardRef(({
  className,
  showToggle = false,
  onValueChange,
  toggleShowLabel = 'Show password',
  toggleHideLabel = 'Hide password',
  value,
  onChange,
  ...props
}, ref) => {
  const inputRef = React.useRef(null)
  const [showPassword, setShowPassword] = React.useState(false)
  const [internalValue, setInternalValue] = React.useState(typeof value === 'string' ? value : '')
  const isControlled = value !== undefined

  // Combine refs
  React.useImperativeHandle(ref, () => inputRef.current)

  // Watch for type attribute tampering via DevTools
  React.useEffect(() => {
    const input = inputRef.current
    if (!input) return

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'type') {
          const currentType = input.getAttribute('type')
          const expectedType = showPassword ? 'text' : 'password'

          // If type was changed externally (not by our toggle), clear and reset
          if (currentType !== expectedType) {
            console.warn('Security: Password input type tampering detected and blocked')
            // Clear the input value for security
            input.value = ''
            setInternalValue('')
            if (onValueChange) onValueChange('')
            // Reset to password type
            input.setAttribute('type', 'password')
            setShowPassword(false)
          }
        }
      })
    })

    observer.observe(input, {
      attributes: true,
      attributeFilter: ['type']
    })

    return () => observer.disconnect()
  }, [showPassword, onValueChange])

  React.useEffect(() => {
    if (isControlled) {
      setInternalValue(typeof value === 'string' ? value : '')
    }
  }, [isControlled, value])

  // Handle value changes
  const handleChange = (e) => {
    if (!isControlled) {
      setInternalValue(e.target.value)
    }
    if (onValueChange) {
      onValueChange(e.target.value)
    }
    if (onChange) {
      onChange(e)
    }
  }

  // Toggle password visibility (controlled)
  const toggleVisibility = () => {
    setShowPassword(prev => !prev)
  }

  return (
    <div className="relative">
      <input
        {...props}
        ref={inputRef}
        type={showPassword ? 'text' : 'password'}
        value={isControlled ? value : internalValue}
        onChange={handleChange}
        autoComplete={props.autoComplete || 'current-password'}
        className={cn(
          "flex h-10 w-full rounded-md border border-gray-300 dark:border-white/10 bg-white dark:bg-[#081224] px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 shadow-sm transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 dark:placeholder:text-cyan-200/45 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:focus:border-primary-500 disabled:cursor-not-allowed disabled:opacity-50",
          showToggle && "pr-10",
          className
        )}
      />
      {showToggle && (
        <button
          type="button"
          onClick={toggleVisibility}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-cyan-200/45 dark:hover:text-cyan-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded"
          aria-label={showPassword ? toggleHideLabel : toggleShowLabel}
          title={showPassword ? toggleHideLabel : toggleShowLabel}
          aria-pressed={showPassword}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  )
})

SecurePasswordInput.displayName = "SecurePasswordInput"

export { SecurePasswordInput }
