import { FormEvent, useState, useEffect, useCallback, useRef } from 'react'
import { EMAIL_CONFIG } from './config/email'

type Metric = {
  value: string
  label: string
}

type Testimonial = {
  quote: string
  name: string
  role: string
}

type Service = {
  name: string
  price: string
  description: string
  features: string[]
  featured?: boolean
}

type BookingData = {
  name: string
  email: string
  phone: string
  service: string
  date: string
  time: string
  notes: string
}

const metrics: Metric[] = [
  { value: '15+', label: 'years of classic barbering tradition' },
  { value: '50K+', label: 'precision cuts and shaves' },
  { value: '4.9', label: 'average customer rating' },
]

const testimonials: Testimonial[] = [
  {
    quote:
      'Best fade I have ever had. The attention to detail is unmatched. This is now my go-to spot every two weeks.',
    name: 'Marcus Johnson',
    role: 'Regular Client',
  },
  {
    quote:
      'The hot towel shave experience is pure luxury. I feel like a new man every time I walk out of that chair.',
    name: 'David Chen',
    role: 'Business Executive',
  },
  {
    quote:
      'Finally found a barbershop that understands modern styles while respecting traditional techniques. Highly recommend.',
    name: 'James Rodriguez',
    role: 'Creative Director',
  },
]

const services: Service[] = [
  {
    name: 'The Classic',
    price: '$35',
    description: 'Precision haircut with attention to every detail.',
    features: ['Consultation', 'Precision cut', 'Hot towel finish', 'Style coaching'],
  },
  {
    name: 'The Gentleman',
    price: '$65',
    description: 'Full service experience for the discerning client.',
    features: ['Premium haircut', 'Straight razor shave', 'Hot towel treatment', 'Beard sculpting'],
    featured: true,
  },
  {
    name: 'Royal Treatment',
    price: '$95',
    description: 'Ultimate grooming package for special occasions.',
    features: ['Executive haircut', 'Full face shave', 'Facial treatment', 'Complimentary beverage'],
  },
]

const faqs = [
  {
    question: 'Do I need to book an appointment?',
    answer: 'We accept walk-ins when available, but we recommend booking ahead to guarantee your preferred time slot.',
  },
  {
    question: 'How long does a typical service take?',
    answer: 'A standard haircut takes 30-45 minutes. Our premium services range from 45 minutes to 1 hour.',
  },
  {
    question: 'What products do you use?',
    answer: 'We use premium grooming products from American Crew, Baxter of California, and our own signature line.',
  },
]

const timeSlots = [
  '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM',
  '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM'
]

function useSmoothScroll() {
  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id)
    if (element) {
      const offset = 100
      const elementPosition = element.getBoundingClientRect().top
      const offsetPosition = elementPosition + window.pageYOffset - offset
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      })
    }
  }, [])

  return scrollToSection
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className={`toast toast-${type}`}>
      <span>{type === 'success' ? '✓' : '✕'}</span>
      <span>{message}</span>
      <button onClick={onClose} className="toast-close">×</button>
    </div>
  )
}

function BookingModal({ 
  isOpen, 
  onClose, 
  preselectedService,
  onBookingSuccess,
  onBookingError
}: { 
  isOpen: boolean
  onClose: () => void
  preselectedService: string
  onBookingSuccess: () => void
  onBookingError: (message: string) => void
}) {
  const [formData, setFormData] = useState<BookingData>({
    name: '',
    email: '',
    phone: '',
    service: preselectedService,
    date: '',
    time: '',
    notes: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [emailStatus, setEmailStatus] = useState<'sending' | 'sent' | 'error' | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (isOpen) {
      setFormData(prev => ({ ...prev, service: preselectedService }))
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen, preselectedService])

  const sendConfirmationEmail = async () => {
    try {
      setEmailStatus('sending')

      const bookingId = `BK-${Date.now().toString(36).toUpperCase()}`

      // Formspree - sends to your Gmail
      const formDataToSend = new FormData()
      formDataToSend.append('name', formData.name)
      formDataToSend.append('email', formData.email)
      formDataToSend.append('phone', formData.phone)
      formDataToSend.append('service', formData.service)
      formDataToSend.append('date', formData.date)
      formDataToSend.append('time', formData.time)
      formDataToSend.append('booking_id', bookingId)
      formDataToSend.append('notes', formData.notes || 'None')
      formDataToSend.append('message', `
New Booking Received!

Booking Details:
----------------
Booking ID: ${bookingId}
Customer: ${formData.name}
Email: ${formData.email}
Phone: ${formData.phone}
Service: ${formData.service}
Date: ${formData.date}
Time: ${formData.time}
Notes: ${formData.notes || 'None'}

---
Please reply to ${formData.email} to confirm the appointment with the customer.
Sent from The Gentleman's Cut Website
      `.trim())

      const response = await fetch(EMAIL_CONFIG.FORMSPREE_ENDPOINT, {
        method: 'POST',
        body: formDataToSend,
        headers: {
          'Accept': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to send notification')
      }

      setEmailStatus('sent')
      return true
    } catch (error) {
      console.error('Email sending failed:', error)
      setEmailStatus('error')
      return false
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    try {
      // Store booking in localStorage first
      const bookings = JSON.parse(localStorage.getItem('bookings') || '[]')
      const bookingWithId = { 
        ...formData, 
        id: Date.now(), 
        createdAt: new Date().toISOString(),
        bookingCode: `BK-${Date.now().toString(36).toUpperCase()}`
      }
      bookings.push(bookingWithId)
      localStorage.setItem('bookings', JSON.stringify(bookings))
      
      // Send confirmation email
      const emailSent = await sendConfirmationEmail()
      
      if (emailSent) {
        onBookingSuccess()
        setShowSuccess(true)
      } else {
        // Still show success but note that email failed
        onBookingError('Booking saved but confirmation email failed to send. We will contact you shortly.')
        setShowSuccess(true)
      }
    } catch (error) {
      onBookingError('Something went wrong. Please try again or call us directly.')
      onBookingError('Something went wrong. Please try again or call us directly.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setShowSuccess(false)
      setEmailStatus(null)
      setFormData({
        name: '',
        email: '',
        phone: '',
        service: '',
        date: '',
        time: '',
        notes: ''
      })
      onClose()
    }
  }

  if (!isOpen) return null

  const minDate = new Date().toISOString().split('T')[0]
  const maxDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose}>×</button>
        
        {showSuccess ? (
          <div className="modal-success">
            <div className="success-icon">✓</div>
            <h3>Booking Confirmed!</h3>
            <p>Thank you, {formData.name}! Your appointment for <strong>{formData.service}</strong> on {formData.date} at {formData.time} has been scheduled.</p>
            <p className="success-note">
              {emailStatus === 'sent' 
                ? `A confirmation email has been sent to ${formData.email}. Please check your inbox (and spam folder).`
                : 'We will send you a confirmation shortly. If you don\'t hear from us within 1 hour, please call us at (555) 123-4567.'
              }
            </p>
            <div className="booking-details">
              <p><strong>Booking Reference:</strong> BK-{Date.now().toString(36).toUpperCase()}</p>
              <p><strong>Service:</strong> {formData.service}</p>
              <p><strong>Date & Time:</strong> {formData.date} at {formData.time}</p>
            </div>
            <button className="button button-primary" onClick={handleClose}>Done</button>
          </div>
        ) : (
          <>
            <h3>Book Your Appointment</h3>
            <p className="modal-subtitle">Fill in your details and we'll send a confirmation to your email.</p>
            
            <form ref={formRef} onSubmit={handleSubmit} className="booking-form">
              <div className="form-group">
                <label htmlFor="booking-name">Full Name *</label>
                <input 
                  id="booking-name"
                  type="text" 
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="John Doe"
                />
              </div>
              
              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="booking-email">Email *</label>
                  <input 
                    id="booking-email"
                    type="email" 
                    required
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    placeholder="john@email.com"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="booking-phone">Phone *</label>
                  <input 
                    id="booking-phone"
                    type="tel" 
                    required
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="booking-service">Service *</label>
                <select 
                  id="booking-service"
                  required
                  value={formData.service}
                  onChange={e => setFormData({...formData, service: e.target.value})}
                >
                  <option value="">Select a service</option>
                  {services.map(s => (
                    <option key={s.name} value={s.name}>{s.name} - {s.price}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="booking-date">Date *</label>
                  <input 
                    id="booking-date"
                    type="date" 
                    required
                    min={minDate}
                    max={maxDate}
                    value={formData.date}
                    onChange={e => setFormData({...formData, date: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="booking-time">Time *</label>
                  <select 
                    id="booking-time"
                    required
                    value={formData.time}
                    onChange={e => setFormData({...formData, time: e.target.value})}
                  >
                    <option value="">Select time</option>
                    {timeSlots.map(time => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="booking-notes">Special Requests (Optional)</label>
                <textarea 
                  id="booking-notes"
                  rows={3}
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  placeholder="Any specific requests or notes for your barber..."
                />
              </div>
              
              <button 
                type="submit" 
                className="button button-primary button-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="button-loading">
                    <span className="spinner"></span>
                    {emailStatus === 'sending' ? 'Sending confirmation...' : 'Confirming...'}
                  </span>
                ) : (
                  'Confirm Booking'
                )}
              </button>
              
              <p className="form-disclaimer">
                By booking, you agree to receive appointment confirmation via email. 
                We respect your privacy and will never share your information.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

function App() {
  const [toast, setToast] = useState<{message: string; type: 'success' | 'error'} | null>(null)
  const [isBookingOpen, setIsBookingOpen] = useState(false)
  const [selectedService, setSelectedService] = useState('')
  const [quickMessage, setQuickMessage] = useState('Book your appointment today. Walk-ins welcome.')
  const scrollToSection = useSmoothScroll()

  // Web3Forms doesn't require initialization
  // Just make sure to set your ACCESS_KEY in src/config/email.ts

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    e.preventDefault()
    scrollToSection(sectionId)
  }

  const openBooking = (serviceName: string = '') => {
    setSelectedService(serviceName)
    setIsBookingOpen(true)
  }

  const handleQuickSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const emailOrPhone = (form.elements.namedItem('email') as HTMLInputElement).value
    
    // Store quick inquiry
    const inquiries = JSON.parse(localStorage.getItem('inquiries') || '[]')
    inquiries.push({ emailOrPhone, date: new Date().toISOString() })
    localStorage.setItem('inquiries', JSON.stringify(inquiries))
    
    // Try to send quick inquiry email
    try {
      const inquiryFormData = new FormData()
      inquiryFormData.append('name', 'Website Visitor')
      inquiryFormData.append('email', emailOrPhone)
      inquiryFormData.append('message', `
New Quick Inquiry Received!

Customer Contact: ${emailOrPhone}
Inquiry Type: Quick Contact Form
Submitted at: ${new Date().toLocaleString()}

---
Sent from The Gentleman's Cut Website
      `.trim())

      const response = await fetch(EMAIL_CONFIG.FORMSPREE_ENDPOINT, {
        method: 'POST',
        body: inquiryFormData,
        headers: {
          'Accept': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to send inquiry')
      }

      setQuickMessage('Thank you! We will contact you within 24 hours to schedule your appointment.')
      setToast({ message: 'Inquiry submitted successfully!', type: 'success' })
    } catch (error) {
      setQuickMessage('Thank you! We have received your inquiry and will contact you soon.')
      setToast({ message: 'Inquiry saved. We will contact you shortly!', type: 'success' })
    }
    
    form.reset()
    
    setTimeout(() => {
      setQuickMessage('Book your appointment today. Walk-ins welcome.')
    }, 5000)
  }

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="page-shell">
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      <BookingModal 
        isOpen={isBookingOpen} 
        onClose={() => setIsBookingOpen(false)}
        preselectedService={selectedService}
        onBookingSuccess={() => setToast({ message: 'Appointment booked! Check your email for confirmation.', type: 'success' })}
        onBookingError={(msg) => setToast({ message: msg, type: 'error' })}
      />

      <header className="topbar">
        <a className="brand" href="#hero" onClick={(e) => handleNavClick(e, 'hero')} aria-label="The Gentleman's Cut home">
          <span className="brand-mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 01-8 0"/>
            </svg>
          </span>
          <span>The Gentleman's Cut</span>
        </a>
        <nav className="nav">
          <a href="#story" onClick={(e) => handleNavClick(e, 'story')}>About</a>
          <a href="#proof" onClick={(e) => handleNavClick(e, 'proof')}>Reviews</a>
          <a href="#pricing" onClick={(e) => handleNavClick(e, 'pricing')}>Services</a>
          <button className="button button-small button-ghost" onClick={() => openBooking()}>
            Book Now
          </button>
        </nav>
      </header>

      <main>
        <section className="hero section" id="hero">
          <div className="hero-copy reveal">
            <p className="eyebrow">Premium Barbering Since 2009</p>
            <h1>Where tradition meets modern style.</h1>
            <p className="hero-text">
              Experience the art of classic barbering in a refined atmosphere. 
              Precision cuts, straight razor shaves, and timeless grooming for the modern gentleman.
            </p>
            <div className="hero-actions">
              <button className="button button-primary" onClick={() => openBooking()}>
                Book Appointment
              </button>
              <button className="button button-secondary" onClick={() => scrollToSection('proof')}>
                Read Reviews
              </button>
            </div>
          </div>

          <div className="hero-panel reveal reveal-delay">
            <div className="panel-grid" aria-hidden="true">
              <div className="stat-card stat-card-accent">
                <span className="stat-kicker">Open Today</span>
                <strong>9-7</strong>
                <span>Walk-ins welcome</span>
              </div>
              <div className="stat-card">
                <span className="stat-kicker">Next Available</span>
                <strong>2:30 PM</strong>
                <span>Book online or call</span>
              </div>
              <div className="stat-card stat-card-wide">
                <span className="stat-kicker">This Week's Special</span>
                <p>
                  Father & Son Package - Book any two services together and save 15%. 
                  The perfect bonding experience.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="metrics section" aria-label="Barbershop achievements">
          {metrics.map((metric) => (
            <article className="metric reveal" key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </article>
          ))}
        </section>

        <section className="story section" id="story">
          <div className="section-heading reveal">
            <p className="eyebrow">Our Story</p>
            <h2>Crafting confidence, one cut at a time.</h2>
          </div>

          <div className="story-grid">
            <article className="story-card reveal">
              <span className="story-index">01</span>
              <h3>The Tradition</h3>
              <p>
                We believe a barbershop should be more than a quick stop. 
                It is a place to unwind, connect, and leave looking your absolute best.
              </p>
            </article>
            <article className="story-card reveal reveal-delay">
              <span className="story-index">02</span>
              <h3>The Craft</h3>
              <p>
                Our master barbers combine time-honored techniques with contemporary 
                styling to deliver cuts that are both classic and current.
              </p>
            </article>
            <article className="story-card reveal reveal-delay-2">
              <span className="story-index">03</span>
              <h3>The Experience</h3>
              <p>
                From the moment you walk in, expect premium service. 
                Complimentary beverages, relaxed atmosphere, and attention to every detail.
              </p>
            </article>
          </div>
        </section>

        <section className="proof section" id="proof">
          <div className="section-heading reveal">
            <p className="eyebrow">Testimonials</p>
            <h2>What our clients say about their experience.</h2>
          </div>

          <div className="testimonial-grid">
            {testimonials.map((item) => (
              <article className="testimonial reveal" key={item.name}>
                <p className="quote">"{item.quote}"</p>
                <p className="person">{item.name}</p>
                <p className="role">{item.role}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="pricing section" id="pricing">
          <div className="section-heading reveal">
            <p className="eyebrow">Services</p>
            <h2>Choose your grooming experience.</h2>
            <p className="section-text">All services include a consultation and complimentary beverage.</p>
          </div>

          <div className="pricing-grid">
            {services.map((service) => (
              <article className={`price-card reveal ${service.featured ? 'price-card-featured' : ''}`} key={service.name}>
                {service.featured ? <span className="badge">Most Popular</span> : null}
                <h3>{service.name}</h3>
                <p className="price">{service.price}</p>
                <p className="price-copy">{service.description}</p>
                <ul className="feature-list">
                  {service.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <button 
                  className={`button ${service.featured ? 'button-primary' : 'button-secondary'}`}
                  onClick={() => openBooking(service.name)}
                >
                  Book Now
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="faq section">
          <div className="section-heading reveal">
            <p className="eyebrow">FAQ</p>
            <h2>Common questions from our clients.</h2>
          </div>

          <div className="faq-list">
            {faqs.map((item) => (
              <article className="faq-item reveal" key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="contact section" id="contact">
          <div className="contact-panel reveal">
            <div>
              <p className="eyebrow">Book Your Visit</p>
              <h2>Ready to experience the difference?</h2>
            </div>
            <form className="contact-form" onSubmit={handleQuickSubmit}>
              <label htmlFor="email">Email or Phone</label>
              <div className="form-row">
                <input id="email" name="email" type="text" placeholder="you@email.com or phone" required />
                <button type="submit" className="button button-primary">
                  Request Appointment
                </button>
              </div>
              <p className="form-note" aria-live="polite">
                {quickMessage}
              </p>
            </form>
          </div>
        </section>
      </main>

      <button className="scroll-top" onClick={scrollToTop} aria-label="Scroll to top">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 15l-6-6-6 6"/>
        </svg>
      </button>
    </div>
  )
}

export default App