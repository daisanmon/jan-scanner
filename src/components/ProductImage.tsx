import { useState } from 'react'

type ProductImageProps = {
  imageUrl?: string
  alt?: string
  size?: 'standard' | 'compact'
}

export function ProductImage({
  imageUrl,
  alt = '',
  size = 'standard',
}: ProductImageProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showPlaceholder = !imageUrl || failedUrl === imageUrl

  return (
    <span className={`product-image product-image--${size}`}>
      {showPlaceholder ? (
        <span className="product-image__placeholder" role="img" aria-label="画像なし">
          画像なし
        </span>
      ) : (
        <img
          className="product-image__media"
          src={imageUrl}
          alt={alt}
          width="96"
          height="96"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(imageUrl)}
        />
      )}
    </span>
  )
}
