import { HttpClient } from '@angular/common/http';
import { Component, OnInit, OnDestroy } from '@angular/core';
import * as L from 'leaflet';
import axios from 'axios';
import { LocationService } from '../location.service.service'; // Adjust the import path as necessary
import { CommonModule } from '@angular/common';
@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css'],
})
export class MapComponent implements OnInit, OnDestroy {
  private map!: L.Map;
  private vehicleMarkers: Map<string, L.Marker> = new Map(); // Store markers by vehicle ID
  private simulationInterval: any; // Store the interval ID for simulation
  private routeCoordinates: L.LatLng[] = []; // Store the route coordinates
  private userMarker?: L.Marker; // Marker for the simulated vehicle
  private carIcon: any; // Car icon for the map
  private animationFrame: number | null = null; // For smooth animation
  private markerHeadings: Map<string, number> = new Map(); // Store current heading for each marker
  
  // User's current real location
  private currentUserLocation: L.LatLng = L.latLng(8.9806, 38.7578); // Default location
  
  // Made public for template access
  public useCurrentLocationAsStart: boolean = false;
  
  // User information - updated with the values you provided
  public currentUser: string = "MetsnanatG";
  public currentDateTime: string = "2025-04-06 18:17:52";
  
  // Loading state
  public isSearching: boolean = false;
  public searchError: string = '';
  
  constructor(private http: HttpClient, private signalRService: LocationService) {
    // Create a more appealing car icon for the map
    this.carIcon = L.divIcon({
      html: `<div class="car-icon">
        <img src="https://images.vexels.com/media/users/3/154573/isolated/preview/bd08e000a449288c914d851cb9dae110-hatchback-car-top-view-silhouette-by-vexels.png" alt="Car" style="width: 36px; height: 25px; transform-origin: center center;" />
            </div>`,
      className: '',
      iconSize: [36, 25],
      iconAnchor: [18, 12.5],
    });
  }

  ngOnInit(): void {
    this.initMap();
    this.getCurrentLocation();

    // Fetch and simulate a real-world route
    this.fetchAndSimulateRoute();

    // Listen for location updates from the backend
    this.signalRService.startConnection();
    this.signalRService.onVehicleLocationReceived((vehicleId, latitude, longitude) => {
      console.log(`Location received: ${vehicleId} - ${latitude}, ${longitude}`); // Debugging log
      this.updateVehicleLocation(vehicleId, latitude, longitude);
    });

    // Add CSS for car icon rotation with improved transition
    this.addCarIconStyle();
  }

  ngOnDestroy(): void {
    if (this.map) this.map.remove();
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval); // Ensure the interval is cleared on component destroy
    }
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }

  private addCarIconStyle(): void {
    // Add CSS to the document head for car icon with improved transition for smoother rotation
    const style = document.createElement('style');
    style.textContent = `
      .car-icon {
        transform-origin: center center;
        transition: transform 2.5s cubic-bezier(0.25, 0.1, 0.25, 1);
        filter: drop-shadow(0px 3px 3px rgba(0,0,0,0.3));
      }
    `;
    document.head.appendChild(style);
  }

  private initMap(): void {
    console.log('Initializing map...'); // Debugging log

    this.map = L.map('map', {
      center: [8.9806, 38.7578], // Default center
      zoom: 13, // Default zoom level
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);

    // Add zoom control at a better position
    L.control.zoom({
      position: 'bottomright'
    }).addTo(this.map);

    console.log('Map initialized');
  }

  // Get the user's current geolocation
  private getCurrentLocation(): void {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.currentUserLocation = L.latLng(position.coords.latitude, position.coords.longitude);
          console.log('Current location acquired:', this.currentUserLocation);
          
          // Show the current location on the map with a different marker
          L.marker(this.currentUserLocation, {
            icon: L.divIcon({
              html: '<div style="background-color: #4285F4; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white;"></div>',
              className: '',
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            })
          })
          .addTo(this.map)
          .bindPopup('Your Current Location')
          .openPopup();
          
          // If "use current location" is enabled, center the map here
          if (this.useCurrentLocationAsStart) {
            this.map.setView(this.currentUserLocation, 15);
          }
        },
        (error) => {
          console.error('Error getting current location:', error);
          alert('Unable to retrieve your location. Using default location instead.');
        }
      );
    } else {
      alert('Geolocation is not supported by your browser. Using default location.');
    }
  }

  // Toggle using current location as starting point - Made public for template access
  public toggleUseCurrentLocation(): void {
    this.useCurrentLocationAsStart = !this.useCurrentLocationAsStart;
    
    if (this.useCurrentLocationAsStart) {
      // Try to get the current location again in case it's changed
      this.getCurrentLocation();
    }
  }

  private async fetchAndSimulateRoute(): Promise<void> {
    const startLatLng = L.latLng(8.9806, 38.7578); // Starting point
    const endLatLng = L.latLng(8.9906, 38.7678);   // Destination point

    // Fetch the route from OpenRouteService
    const route = await this.fetchRoute(startLatLng, endLatLng);

    if (!route || route.length === 0) {
      alert('Could not fetch a valid route. Please try again.');
      return;
    }

    // Draw the full route on the map (in blue)
    const routeLine = L.polyline(route, {
      color: 'blue',
      weight: 8,
      opacity: 0.7,
    }).addTo(this.map);

    // Center the map to fit the route
    const bounds = L.latLngBounds(route);
    this.map.fitBounds(bounds, { padding: [50, 50] });

    // Simulate vehicle movement along the route
    this.simulateVehicleMovement(route);
  }

  private async fetchRoute(start: L.LatLng, end: L.LatLng): Promise<L.LatLng[]> {
    const apiKey = '5b3ce3597851110001cf6248b88dd386796d4bdf9d80f414102cc7c3'; // Replace with your OpenRouteService API key
    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${apiKey}&start=${start.lng},${start.lat}&end=${end.lng},${end.lat}`;

    try {
      console.log('Fetching route from API:', url); // Debugging log
      const response = await axios.get(url);
      const coordinates = response.data.features[0].geometry.coordinates;

      // Convert coordinates to Leaflet LatLng format
      return coordinates.map((coord: [number, number]) => L.latLng(coord[1], coord[0]));
    } catch (error) {
      console.error('Error fetching route:', error);
      return [];
    }
  }

  // Geocode a location name to coordinates
  private async geocodeLocation(locationName: string): Promise<L.LatLng | null> {
    const apiKey = '5b3ce3597851110001cf6248b88dd386796d4bdf9d80f414102cc7c3'; // Replace with your OpenRouteService API key
    const url = `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(locationName)}`;
    
    try {
      console.log('Geocoding location:', locationName);
      const response = await axios.get(url);
      
      if (response.data.features && response.data.features.length > 0) {
        const coordinates = response.data.features[0].geometry.coordinates;
        return L.latLng(coordinates[1], coordinates[0]);
      } else {
        throw new Error('Location not found');
      }
    } catch (error) {
      console.error('Error geocoding location:', error);
      return null;
    }
  }

  private simulateVehicleMovement(route: L.LatLng[]): void {
    let currentIndex = 0;
    let prevHeading = 0; // Store the previous heading
    let animationProgress = 0;
    const ANIMATION_DURATION = 3000; // 3 seconds between points (slow car-like movement)
    
    // Store initial heading for the user marker
    this.markerHeadings.set('user', 0);

    // Interpolate between points for smoother movement
    const interpolatePoints = (pointA: L.LatLng, pointB: L.LatLng, progress: number): L.LatLng => {
      const lat = pointA.lat + (pointB.lat - pointA.lat) * progress;
      const lng = pointA.lng + (pointB.lng - pointA.lng) * progress;
      return L.latLng(lat, lng);
    };

    // Track our traveled coordinates (for the red path)
    const traveledPathCoordinates: L.LatLng[] = [route[0]];

    // Create the traveled path polyline in red
    const traveledPathLine = L.polyline(traveledPathCoordinates, {
      color: 'red',
      weight: 8,
      opacity: 0.9,
    }).addTo(this.map);

    // Initialize the vehicle marker at the starting point (if it doesn't exist)
    if (!this.userMarker) {
      this.userMarker = L.marker(route[0], {
        icon: this.carIcon,
        title: 'Simulated Vehicle',
      })
        .addTo(this.map)
        .bindPopup('Simulated Vehicle')
        .openPopup();
    } else {
      this.userMarker.setIcon(this.carIcon);
      this.userMarker.setLatLng(route[0]);
    }

    // Animation function using requestAnimationFrame for smooth movement
    const animate = (timestamp: number) => {
      if (!this.userMarker || currentIndex >= route.length - 1) {
        console.log('Vehicle movement simulation completed.');
        return;
      }

      // Calculate progress for this frame
      animationProgress += 16 / ANIMATION_DURATION; // 16ms is approx. one frame

      if (animationProgress >= 1) {
        // Move to next point
        animationProgress = 0;
        currentIndex++;
        
        // Add point to the traveled path
        traveledPathCoordinates.push(route[currentIndex]);
        traveledPathLine.setLatLngs(traveledPathCoordinates);
        
        // If we've reached the end, stop animation
        if (currentIndex >= route.length - 1) {
          console.log('Vehicle movement simulation completed.');
          return;
        }
      }

      const pointA = route[currentIndex];
      const pointB = route[currentIndex + 1];
      
      // Calculate current position by interpolating between points
      const currentPos = interpolatePoints(pointA, pointB, animationProgress);
      
      // Calculate bearing
      let targetHeading = this.calculateHeading(pointA, pointB);
      
      // Get the current heading (or 0 if not set yet)
      let currentHeading = this.markerHeadings.get('user') || 0;
      
      // Normalize headings to prevent spinning in the wrong direction
      // when crossing the 0/360 boundary
      if (Math.abs(targetHeading - currentHeading) > 180) {
        if (targetHeading > currentHeading) {
          currentHeading += 360;
        } else {
          targetHeading += 360;
        }
      }
      
      // Use a very gradual interpolation for smoother rotation (0.05 factor for slower change)
      let newHeading = currentHeading * 0.95 + targetHeading * 0.05;
      
      // Normalize heading to 0-360 for storage
      newHeading = newHeading % 360;
      
      // Store the new heading for next frame
      this.markerHeadings.set('user', newHeading);
      
      // Update marker position
      this.userMarker.setLatLng(currentPos);
      
      // Apply rotation with 90 degree offset
      const element = this.userMarker.getElement();
      const iconElement = element?.querySelector('.car-icon') as HTMLElement;
      if (iconElement) {
        iconElement.style.transform = `rotate(${newHeading + 90}deg)`;
      }
      
      // Continue animation
      this.animationFrame = requestAnimationFrame(animate);
    };

    // Start animation
    this.animationFrame = requestAnimationFrame(animate);
  }

  // Calculate the heading/bearing between two points in degrees
  private calculateHeading(start: L.LatLng, end: L.LatLng): number {
    const startLat = start.lat * Math.PI / 180;
    const startLng = start.lng * Math.PI / 180;
    const endLat = end.lat * Math.PI / 180;
    const endLng = end.lng * Math.PI / 180;

    const dLng = endLng - startLng;

    const y = Math.sin(dLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) -
              Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    bearing = (bearing + 360) % 360; // Normalize to 0-360

    return bearing;
  }

  // Modified search function to handle location names
  public async searchDestination(): Promise<void> {
    this.isSearching = true;
    this.searchError = '';
    
    try {
      const input = (document.getElementById('destination') as HTMLInputElement).value;
    
      if (!input) {
        this.searchError = 'Please enter a destination.';
        this.isSearching = false;
        return;
      }
      
      // Determine starting point
      const startLatLng = this.useCurrentLocationAsStart 
        ? this.currentUserLocation 
        : (this.userMarker ? this.userMarker.getLatLng() : L.latLng(8.9806, 38.7578));
      
      let endLatLng: L.LatLng | null = null;
      
      // Check if input contains coordinates (lat,lng format)
      const coordsRegex = /^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/;
      const coordsMatch = input.match(coordsRegex);
      
      if (coordsMatch) {
        // Input is coordinates
        const latitude = parseFloat(coordsMatch[1]);
        const longitude = parseFloat(coordsMatch[3]);
        
        if (!isNaN(latitude) && !isNaN(longitude)) {
          endLatLng = L.latLng(latitude, longitude);
        } else {
          this.searchError = 'Invalid coordinates format.';
          this.isSearching = false;
          return;
        }
      } else {
        // Input is a location name, geocode it
        endLatLng = await this.geocodeLocation(input);
        
        if (!endLatLng) {
          this.searchError = 'Location not found. Please try a different name or use coordinates.';
          this.isSearching = false;
          return;
        }
      }
      
      console.log('Searching route from:', startLatLng, 'to:', endLatLng);
      
      // Fetch and simulate the route
      const route = await this.fetchRoute(startLatLng, endLatLng);
      
      if (!route || route.length === 0) {
        this.searchError = 'Could not fetch a valid route. Please try again.';
        this.isSearching = false;
        return;
      }

      // Cancel any existing animation
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
    
      // Clear existing route and markers (except the current location marker)
      this.map.eachLayer((layer) => {
        if (layer instanceof L.Polyline) {
          this.map.removeLayer(layer);
        }
      });
    
      // Draw the new route
      const routeLine = L.polyline(route, {
        color: 'blue',
        weight: 8,
        opacity: 0.7,
      }).addTo(this.map);
    
      // Fit the map to the new route
      this.map.fitBounds(L.latLngBounds(route), { padding: [50, 50] });
    
      // Start the simulation
      this.simulateVehicleMovement(route);
      
      // Add destination marker
      L.marker(endLatLng, {
        icon: L.divIcon({
          html: '<div style="background-color: #EA4335; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white;"></div>',
          className: '',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        })
      })
      .addTo(this.map)
      .bindPopup('Destination: ' + input);
      
      this.isSearching = false;
    } catch (error) {
      console.error('Error during destination search:', error);
      this.searchError = 'An error occurred during search. Please try again.';
      this.isSearching = false;
    }
  }

  private updateVehicleLocation(vehicleId: string, latitude: number, longitude: number): void {
    console.log(`Updating marker for ${vehicleId} at ${latitude}, ${longitude}`); // Debugging log

    const newLatLng = L.latLng(latitude, longitude);

    if (this.vehicleMarkers.has(vehicleId)) {
      const marker = this.vehicleMarkers.get(vehicleId)!;
      const oldLatLng = marker.getLatLng();
      
      // Calculate target heading between old and new position
      const targetHeading = this.calculateHeading(oldLatLng, newLatLng);
      
      // Get current heading for this vehicle marker (or initialize if not set)
      const currentHeading = this.markerHeadings.get(vehicleId) || targetHeading;
      
      // Normalize headings to prevent spinning in the wrong direction
      let normalizedTarget = targetHeading;
      let normalizedCurrent = currentHeading;
      
      if (Math.abs(normalizedTarget - normalizedCurrent) > 180) {
        if (normalizedTarget > normalizedCurrent) {
          normalizedCurrent += 360;
        } else {
          normalizedTarget += 360;
        }
      }
      
      // Calculate new heading with smoother interpolation (0.2 factor for moderate change)
      let newHeading = normalizedCurrent * 0.8 + normalizedTarget * 0.2;
      
      // Normalize heading to 0-360 for storage
      newHeading = newHeading % 360;
      
      // Store the new heading for next update
      this.markerHeadings.set(vehicleId, newHeading);
      
      // Smoothly move the marker
      marker.setLatLng(newLatLng);
      
      // Apply rotation with 90 degree offset
      const element = marker.getElement();
      const iconElement = element?.querySelector('.car-icon') as HTMLElement;
      if (iconElement) {
        iconElement.style.transform = `rotate(${newHeading + 90}deg)`;
      }
    } else {
      // Create a new marker with car icon if it doesn't exist
      const marker = L.marker(newLatLng, {
        icon: this.carIcon,
      }).addTo(this.map);
      
      // Initialize heading for this new marker
      this.markerHeadings.set(vehicleId, 0);

      marker.bindPopup(`Vehicle: ${vehicleId}`);
      this.vehicleMarkers.set(vehicleId, marker);
      console.log(`Marker created for ${vehicleId}`);
    }
  }
}