import { Component, OnInit, OnDestroy } from '@angular/core';
import * as L from 'leaflet';
import { LocationService } from '../location.service.service';
import { environment } from '../../Environment/environment';
import axios from 'axios';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  imports: [CommonModule, FormsModule], // Ensure FormsModule is included
  standalone: true,
  styleUrls: ['./map.component.css']
})
export class MapComponent implements OnInit, OnDestroy {
  private map!: L.Map;
  private userMarker?: L.Marker;
  private defaultIcon: L.Icon;
  private moveInterval: any; // Store the interval ID
  public isSimulationRunning: boolean = false; // Track simulation state

  // Properties for user inputs
  public startLocation: string = ''; // User-provided start location
  public endLocation: string = ''; // User-provided destination location

  constructor(private locationService: LocationService) {
    this.defaultIcon = L.icon({
      iconUrl: 'marker-icon.png',
      iconRetinaUrl: '/marker-icon-2x.png',
      shadowUrl: '/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });
  }

  ngOnInit(): void {
    this.initMap();
  }

  ngOnDestroy(): void {
    if (this.map) this.map.remove();
    if (this.moveInterval) {
      clearInterval(this.moveInterval); // Ensure the interval is cleared on component destroy
    }
  }

  private initMap(): void {
    this.map = L.map('map', {
      center: [0, 0],
      zoom: 2,
      zoomControl: false
    });

    L.tileLayer(environment.mapTileUrl, {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);

    L.control.zoom({ position: 'topright' }).addTo(this.map);
  }

  public async simulateCarMovement(): Promise<void> {
    console.log('Simulation started'); // Debugging log

    // Validate user input for the destination
    if (!this.endLocation) {
      alert('Please provide a destination location.');
      return;
    }

    // Fetch the user's current location as the starting point
    let startLatLng: L.LatLng | null = null;
    if (navigator.geolocation) {
      try {
        startLatLng = await new Promise<L.LatLng>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const { latitude, longitude } = position.coords;
              resolve(L.latLng(latitude, longitude));
            },
            (error) => {
              console.error('Error fetching current location:', error);
              reject(null);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          );
        });
      } catch (error) {
        alert('Failed to fetch your current location. Please enable location services.');
        return;
      }
    } else {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    // Fetch coordinates for the destination location
    const endLatLng = await this.geocodeLocation(this.endLocation);

    if (!startLatLng || !endLatLng) {
      alert('Could not fetch coordinates for the starting or destination location.');
      return;
    }

    // Fetch the route from OpenRouteService
    const route = await this.fetchRoute(startLatLng, endLatLng);

    if (!route || route.length === 0) {
      alert('Could not fetch a valid route. Please try again with different locations.');
      return;
    }

    // Draw the full route on the map
    const routeLine = L.polyline(route, {
      color: 'blue', // Route color
      weight: 8, // Line thickness
      opacity: 0.7, // Line opacity
    }).addTo(this.map);

    // Center the map to fit the route
    const bounds = L.latLngBounds(route);
    this.map.fitBounds(bounds, { padding: [50, 50] });

    // Initialize the car marker at the starting point
    if (!this.userMarker) {
      this.userMarker = L.marker(startLatLng, {
        icon: this.defaultIcon,
        title: 'Simulated Car'
      }).addTo(this.map)
        .bindPopup('Simulated Car')
        .openPopup();
    }

    // Initialize the traveled path polyline
    let traveledPathCoordinates: L.LatLng[] = [startLatLng];
    const traveledPathLine = L.polyline(traveledPathCoordinates, {
      color: 'red', // Traveled path color
      weight: 8, // Line thickness
      opacity: 0.9, // Line opacity
    }).addTo(this.map);

    // Smoothly move the car marker along the route
    let currentIndex = 0;
    this.isSimulationRunning = true; // Set simulation state to running
    this.moveInterval = setInterval(() => {
      if (currentIndex >= route.length - 1) {
        clearInterval(this.moveInterval);
        this.isSimulationRunning = false; // Set simulation state to stopped
        console.log('Car movement simulation completed.');
        return;
      }

      currentIndex++;
      const currentLatLng = route[currentIndex];

      // Update the marker's position
      if (this.userMarker) {
        this.userMarker.setLatLng(currentLatLng);
      }

      // Add the current position to the traveled path
      traveledPathCoordinates.push(currentLatLng);
      traveledPathLine.setLatLngs(traveledPathCoordinates);

      // Log the current position
      console.log(`Simulated car location: Latitude: ${currentLatLng.lat}, Longitude: ${currentLatLng.lng}`);
    }, 200); // Adjust the interval for smoother or faster movement
  }

  public stopSimulation(): void {
    if (this.moveInterval) {
      clearInterval(this.moveInterval); // Stop the interval
      this.isSimulationRunning = false; // Set simulation state to stopped
      console.log('Simulation stopped by user.');
    }
  }

  private async fetchRoute(start: L.LatLng, end: L.LatLng): Promise<L.LatLng[]> {
    const apiKey = '5b3ce3597851110001cf6248b88dd386796d4bdf9d80f414102cc7c3'; // Replace with your API key
    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${apiKey}&start=${start.lng},${start.lat}&end=${end.lng},${end.lat}&radiuses=5000,5000`;

    try {
      console.log('Routing API URL:', url); // Debugging log
      const response = await axios.get(url);
      const coordinates = response.data.features[0].geometry.coordinates;

      // Convert coordinates to Leaflet LatLng format
      return coordinates.map((coord: [number, number]) => L.latLng(coord[1], coord[0]));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response && error.response.data && error.response.data.message) {
          console.error('Routing API Error:', error.response.data.message);
          alert(`Routing API Error: ${error.response.data.message}`);
        } else {
          console.error('Error fetching route:', error.message);
        }
      } else {
        console.error('Unexpected error:', error);
      }
      return [];
    }
  }

  private async geocodeLocation(location: string): Promise<L.LatLng | null> {
    const apiKey = '5b3ce3597851110001cf6248b88dd386796d4bdf9d80f414102cc7c3'; // Replace with your geocoding API key
    const url = `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(location)}`;

    try {
      const response = await axios.get(url);
      console.log('Geocoding API Response:', response.data); // Debugging log

      const features = response.data.features;

      if (features && features.length > 0) {
        const [lng, lat] = features[0].geometry.coordinates;
        console.log(`Resolved Coordinates for "${location}": Latitude: ${lat}, Longitude: ${lng}`);
        return L.latLng(lat, lng);
      } else {
        console.error('No results found for location:', location);
        return null;
      }
    } catch (error) {
      console.error('Error fetching geocoding data:', error);
      return null;
    }
  }

  private isValidCoordinate(lat: number, lng: number): boolean {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }
}