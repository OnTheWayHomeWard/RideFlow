export default function Logo({ url, size = 'md', className = '' }) {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-14 h-14',
  }

  if (url) {
    return <img src={url} alt="Logo" className={`${sizes[size]} object-contain rounded-xl ${className}`} />
  }

  // Default icon fallback
  return (
    <div className={`${sizes[size]} bg-purple-600 rounded-xl flex items-center justify-center ${className}`}>
      <svg className="w-2/3 h-2/3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    </div>
  )
}
