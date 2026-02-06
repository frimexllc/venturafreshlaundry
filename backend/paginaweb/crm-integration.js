/**
 * Ventura Fresh Laundry - CRM Integration Script
 * This script connects the HTML forms to the FastAPI backend
 */

(function() {
  'use strict';
  
  const API_BASE = '/api';
  
  // Toast notification function
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `vfl-toast vfl-toast-${type}`;
    toast.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-family: sans-serif;
        animation: slideIn 0.3s ease;
      ">
        ${message}
      </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }
  
  // Helper to get form data
  function getFormData(form) {
    const formData = new FormData(form);
    const data = {};
    for (let [key, value] of formData.entries()) {
      data[key] = value;
    }
    return data;
  }
  
  // Schedule Pickup Form Handler
  function handleScheduleForm(form) {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      const originalText = submitBtn ? submitBtn.textContent || submitBtn.value : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
      }
      
      try {
        // Get all input fields
        const inputs = form.querySelectorAll('input, select, textarea');
        const data = {};
        
        inputs.forEach(input => {
          if (input.name) {
            data[input.name] = input.value;
          }
        });
        
        // Map to API format
        const payload = {
          name: data.name || data.firstName + ' ' + (data.lastName || ''),
          email: data.email || '',
          phone: data.phone || data.telephone || '',
          address: data.address || `${data.street || ''} ${data.city || ''} ${data.state || ''} ${data.zip || ''}`.trim(),
          pickup_date: data.pickupDate || data.date || '',
          pickup_time: data.pickupTime || data.time || '',
          service_type: data.serviceType || data.service || 'pickup_delivery',
          notes: data.notes || data.message || data.comments || ''
        };
        
        const response = await fetch(`${API_BASE}/public/pickup-request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (response.ok) {
          showToast(result.message || '¡Solicitud enviada correctamente!', 'success');
          form.reset();
        } else {
          throw new Error(result.detail || 'Error al enviar');
        }
      } catch (error) {
        showToast(error.message || 'Error al enviar la solicitud', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });
  }
  
  // Contact Form Handler
  function handleContactForm(form) {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      const originalText = submitBtn ? submitBtn.textContent || submitBtn.value : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
      }
      
      try {
        const inputs = form.querySelectorAll('input, select, textarea');
        const data = {};
        
        inputs.forEach(input => {
          if (input.name) {
            data[input.name] = input.value;
          }
        });
        
        const payload = {
          name: data.name || data.firstName + ' ' + (data.lastName || ''),
          email: data.email || '',
          phone: data.phone || '',
          message: data.message || data.comments || data.inquiry || ''
        };
        
        const response = await fetch(`${API_BASE}/public/contact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (response.ok) {
          showToast(result.message || '¡Mensaje enviado correctamente!', 'success');
          form.reset();
        } else {
          throw new Error(result.detail || 'Error al enviar');
        }
      } catch (error) {
        showToast(error.message || 'Error al enviar el mensaje', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });
  }
  
  // Quote Request Form Handler
  function handleQuoteForm(form) {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      const originalText = submitBtn ? submitBtn.textContent || submitBtn.value : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
      }
      
      try {
        const inputs = form.querySelectorAll('input, select, textarea');
        const data = {};
        
        inputs.forEach(input => {
          if (input.name) {
            data[input.name] = input.value;
          }
        });
        
        const payload = {
          company_name: data.company || data.businessName || '',
          contact_name: data.name || data.contactName || '',
          email: data.email || '',
          phone: data.phone || '',
          industry: data.industry || data.businessType || '',
          estimated_lbs: parseFloat(data.volume || data.lbs || 0) || null,
          message: data.message || data.notes || ''
        };
        
        const response = await fetch(`${API_BASE}/public/quote-request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (response.ok) {
          showToast(result.message || '¡Solicitud de cotización enviada!', 'success');
          form.reset();
        } else {
          throw new Error(result.detail || 'Error al enviar');
        }
      } catch (error) {
        showToast(error.message || 'Error al enviar la solicitud', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });
  }
  
  // Customer Login Handler
  function handleLoginForm(form) {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      const originalText = submitBtn ? submitBtn.textContent || submitBtn.value : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Logging in...';
      }
      
      try {
        const inputs = form.querySelectorAll('input');
        const data = {};
        
        inputs.forEach(input => {
          if (input.name || input.type) {
            if (input.type === 'email') data.email = input.value;
            else if (input.type === 'password') data.password = input.value;
            else if (input.name) data[input.name] = input.value;
          }
        });
        
        const response = await fetch(`${API_BASE}/customer/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: data.email, password: data.password })
        });
        
        const result = await response.json();
        
        if (response.ok) {
          localStorage.setItem('customer_token', result.access_token);
          localStorage.setItem('customer_data', JSON.stringify(result.customer));
          showToast('¡Bienvenido!', 'success');
          setTimeout(() => window.location.href = '/web/account', 1000);
        } else {
          throw new Error(result.detail || 'Credenciales inválidas');
        }
      } catch (error) {
        showToast(error.message || 'Error al iniciar sesión', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });
  }
  
  // Customer Register Handler  
  function handleRegisterForm(form) {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      const originalText = submitBtn ? submitBtn.textContent || submitBtn.value : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account...';
      }
      
      try {
        const inputs = form.querySelectorAll('input');
        const data = {};
        
        inputs.forEach(input => {
          if (input.name || input.type) {
            if (input.type === 'email') data.email = input.value;
            else if (input.type === 'password') data.password = input.value;
            else if (input.name) data[input.name] = input.value;
          }
        });
        
        const response = await fetch(`${API_BASE}/customer/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: data.name || data.firstName || 'Customer',
            email: data.email, 
            password: data.password 
          })
        });
        
        const result = await response.json();
        
        if (response.ok) {
          localStorage.setItem('customer_token', result.access_token);
          localStorage.setItem('customer_data', JSON.stringify(result.customer));
          showToast('¡Cuenta creada exitosamente!', 'success');
          setTimeout(() => window.location.href = '/web/account', 1000);
        } else {
          throw new Error(result.detail || 'Error al crear cuenta');
        }
      } catch (error) {
        showToast(error.message || 'Error al registrarse', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });
  }
  
  // Auto-detect and attach form handlers
  function initForms() {
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
      const formAction = (form.action || '').toLowerCase();
      const formId = (form.id || '').toLowerCase();
      const formClass = (form.className || '').toLowerCase();
      const formText = (form.textContent || '').toLowerCase();
      
      // Detect form type and attach handler
      if (formAction.includes('schedule') || formId.includes('schedule') || formId.includes('pickup') ||
          formClass.includes('schedule') || formText.includes('schedule pickup')) {
        handleScheduleForm(form);
        console.log('VFL: Schedule form detected and connected');
      } else if (formAction.includes('contact') || formId.includes('contact') || 
                 formClass.includes('contact')) {
        handleContactForm(form);
        console.log('VFL: Contact form detected and connected');
      } else if (formAction.includes('quote') || formId.includes('quote') || formId.includes('b2b') ||
                 formClass.includes('quote')) {
        handleQuoteForm(form);
        console.log('VFL: Quote form detected and connected');
      } else if (formAction.includes('login') || formId.includes('login') || 
                 formClass.includes('login')) {
        handleLoginForm(form);
        console.log('VFL: Login form detected and connected');
      } else if (formAction.includes('register') || formId.includes('register') || formId.includes('signup') ||
                 formClass.includes('register')) {
        handleRegisterForm(form);
        console.log('VFL: Register form detected and connected');
      } else {
        // Default: treat unknown forms as contact/general inquiry
        handleContactForm(form);
        console.log('VFL: Generic form connected as contact form');
      }
    });
  }
  
  // Load customer data if logged in
  function loadCustomerData() {
    const token = localStorage.getItem('customer_token');
    const customerData = localStorage.getItem('customer_data');
    
    if (token && customerData) {
      try {
        const customer = JSON.parse(customerData);
        // Update any customer name displays
        const nameElements = document.querySelectorAll('[data-customer-name], .customer-name');
        nameElements.forEach(el => {
          el.textContent = customer.name || 'Customer';
        });
        
        // Update account links
        const accountLinks = document.querySelectorAll('a[href*="account"], a[href*="login"]');
        accountLinks.forEach(link => {
          if (link.textContent.toLowerCase().includes('login') || 
              link.textContent.toLowerCase().includes('sign in')) {
            link.textContent = customer.name?.split(' ')[0] || 'Account';
          }
        });
      } catch (e) {
        console.error('VFL: Error loading customer data', e);
      }
    }
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initForms();
      loadCustomerData();
    });
  } else {
    initForms();
    loadCustomerData();
  }
  
  console.log('VFL CRM Integration Script loaded');
})();
