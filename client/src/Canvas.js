import React, { Component, Fragment } from 'react';
import { CRS, LatLngBounds } from 'leaflet';
import {
  Map,
  ImageOverlay,
  Polyline,
  Polygon,
  CircleMarker,
} from 'react-leaflet';
import Hotkeys from 'react-hot-keys';
import update from 'immutability-helper';
import 'leaflet-path-drag';

import 'leaflet/dist/leaflet.css';

const maxZoom = 7;
let imgRef = new Image();
let skipNextClickEvent = false;
export default class Canvas extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      lastColor: null,
      bounds: null,
      zoom: -1,
      height: null,
      width: null,
      // state: editing/drawing is derived from the props.color
      unfinishedFigure: null,
      selectedFigure: null,
    };
    this.prevSelectedFigure = null;

    this.mapRef = React.createRef();
    this.handleChange = this.handleChange.bind(this);
    this.handleClick = this.handleClick.bind(this);
  }

  componentDidMount() {
    this.calcBounds(this.props.url);
  }

  componentDidUpdate(prevProps) {
    if (this.props.url !== prevProps.url) {
      this.calcBounds(this.props.url);
    }
  }

  static getDerivedStateFromProps(props, state) {
    if (props.color !== state.lastColor && props.color) {
      return {
        unfinishedFigure: {
          id: null,
          color: props.color,
          points: [],
        },
        lastColor: props.color,
      };
    }

    return {
      lastColor: props.color,
    };
  }

  calcBounds(url) {
    const crs = CRS.Simple;
    imgRef.src = url;
    imgRef.onload = () => {
      const { height, width } = imgRef;
      const southWest = crs.unproject({ x: 0, y: imgRef.height }, maxZoom - 1);
      const northEast = crs.unproject({ x: imgRef.width, y: 0 }, maxZoom - 1);
      const bounds = new LatLngBounds(southWest, northEast);

      this.setState({ bounds, height, width });
    };
  }

  getSelectedFigure() {
    const { selectedFigure } = this.state;
    return selectedFigure;
  }

  handleChange(eventType, { point, pos, figure }) {
    const { unfinishedFigure } = this.state;
    const { onChange, color } = this.props;
    const drawing = !!color;

    switch (eventType) {
      case 'add':
        if (drawing) {
          let newState = unfinishedFigure.points;
          newState = update(newState, { $push: [point] });

          this.setState({
            unfinishedFigure: update(unfinishedFigure, {
              points: {
                $set: newState,
              },
            }),
          });
        } else {
          onChange(
            'replace',
            update(figure, { points: { $splice: [[pos, 0, point]] } })
          );
        }
        break;

      case 'end':
        const f = unfinishedFigure;
        onChange('new', f);
        this.setState({
          unfinishedFigure: null,
        });
        break;

      case 'move':
        onChange(
          'replace',
          update(figure, { points: { $splice: [[pos, 1, point]] } })
        );
        break;

      case 'remove':
        onChange(
          'replace',
          update(figure, { points: { $splice: [[pos, 1]] } })
        );
        break;

      default:
        throw new Error('unknown event type ' + eventType);
    }
  }

  handleClick(e) {
    const { color } = this.props;
    const drawing = !!color;

    if (skipNextClickEvent) {
      // a hack, for whatever reason it is really hard to stop event propagation in leaflet
      skipNextClickEvent = false;
      return;
    }

    if (drawing) {
      this.handleChange('add', { point: convertPoint(e.latlng) });
    }

    if (!drawing) {
      this.setState({ selectedFigure: null });
    }
  }

  render() {
    const {
      url,
      color,
      figures,
      onChange,
      onReassignment,
      onSelectionChange,
      style,
    } = this.props;
    const {
      bounds,
      zoom,
      height,
      width,
      unfinishedFigure,
      selectedFigure,
    } = this.state;

    const drawing = !!color;

    if (!bounds) {
      return null;
    }

    if (this.prevSelectedFigure !== selectedFigure && onSelectionChange) {
      this.prevSelectedFigure = selectedFigure;
      onSelectionChange(selectedFigure);
    }

    const calcDistance = (p1, p2) => {
      const map = this.mapRef.current.leafletElement;
      return map.latLngToLayerPoint(p1).distanceTo(map.latLngToLayerPoint(p2));
    };

    const unfinishedDrawingDOM = drawing ? (
      <Figure
        figure={unfinishedFigure}
        options={{
          finished: false,
          editing: false,
          interactive: false,
          onChange: this.handleChange,
          calcDistance,
        }}
      />
    ) : null;

    const figuresDOM = figures.map((f, i) => (
      <Figure
        key={f.id}
        figure={f}
        options={{
          editing: selectedFigure && selectedFigure.id === f.id && !drawing,
          finished: true,
          interactive: !drawing,
          onSelect: () => this.setState({ selectedFigure: f }),
          onChange: this.handleChange,
          calcDistance,
        }}
      />
    ));

    const hotkeysDOM = (
      <Hotkeys
        keyName="backspace,del,c,f"
        onKeyDown={key => {
          if (key === 'f' && drawing) {
            if (unfinishedFigure.points.length >= 3) {
              this.handleChange('end', {});
            }
          } else if (drawing) {
            if (key === 'c') {
              if (selectedFigure) {
                onReassignment();
              }
            } else {
              onChange('delete', selectedFigure);
            }
          }
        }}
      />
    );

    return (
      <div
        style={{
          cursor: drawing ? 'crosshair' : 'grab',
          height: '100%',
          ...style,
        }}
      >
        <Map
          crs={CRS.Simple}
          zoom={zoom}
          minZoom={-50}
          maxZoom={maxZoom}
          center={[height / 2, width / 2]}
          zoomAnimation={false}
          zoomSnap={0.1}
          attributionControl={false}
          onClick={this.handleClick}
          onZoom={e => this.setState({ zoom: e.target.getZoom() })}
          ref={this.mapRef}
        >
          <ImageOverlay url={url} bounds={bounds} />
          {unfinishedDrawingDOM}
          {figuresDOM}
          {hotkeysDOM}
        </Map>
      </div>
    );
  }
}

class Figure extends Component {
  constructor(props) {
    super(props);
    this.state = {
      dragging: false,
      guides: [],
    };
  }

  render() {
    const { figure, options } = this.props;
    const { id, points, color } = figure;
    const {
      editing,
      finished,
      interactive,
      calcDistance,
      onChange,
      onSelect,
    } = options;
    const { dragging, guides } = this.state;

    const vertices = points.map((pos, i) => (
      <CircleMarker
        key={id + '-' + i}
        color={color}
        center={pos}
        radius={5}
        onClick={e => {
          if (!finished && i === 0) {
            if (points.length >= 3) {
              onChange('end', {});
            }
            skipNextClickEvent = true;
            return false;
          }

          if (finished && editing) {
            if (points.length > 3) {
              onChange('remove', { pos: i, figure });
            }
            return false;
          }
        }}
        draggable={editing}
        onDrag={e => {
          this.setState({
            guides: [
              [
                points[(i - 1 + points.length) % points.length],
                e.target.getLatLng(),
              ],
              [points[(i + 1) % points.length], e.target.getLatLng()],
            ],
          });
        }}
        onDragstart={e => this.setState({ dragging: true })}
        onDragend={e => {
          onChange('move', { point: e.target.getLatLng(), pos: i, figure });
          this.setState({ dragging: false, guides: [] });
        }}
      />
    ));

    const midPoints = points
      .map((pos, i) => [pos, points[(i + 1) % points.length], i])
      .filter(([a, b]) => calcDistance(a, b) > 40)
      .map(([a, b, i]) => (
        <CircleMarker
          key={id + '-' + i + '-mid'}
          color="white"
          center={midPoint(a, b)}
          radius={3}
          opacity={0.5}
          onClick={e => {
            onChange('add', { point: midPoint(a, b), pos: i + 1, figure });
            skipNextClickEvent = true;
          }}
        />
      ));

    const allCircles = (!finished || editing ? vertices : []).concat(
      finished && editing && !dragging ? midPoints : []
    );

    const guideLines = guides.map((pos, i) => (
      <Polyline
        key={i}
        positions={pos}
        color={color}
        opacity={0.7}
        dashArray="4"
      />
    ));

    const PolyComp = finished ? Polygon : Polyline;

    return (
      <Fragment key={id}>
        <PolyComp
          positions={points}
          color={color}
          weight={3}
          fill={true}
          fillColor={color}
          interactive={interactive}
          onClick={() => {
            if (interactive) {
              onSelect();
              skipNextClickEvent = true;
            }
          }}
        />
        {allCircles}
        {guideLines}
      </Fragment>
    );
  }
}

function convertPoint(p) {
  return {
    lat: p.lat,
    lng: p.lng,
  };
}

function midPoint(p1, p2) {
  return {
    lat: (p1.lat + p2.lat) / 2,
    lng: (p1.lng + p2.lng) / 2,
  };
}
